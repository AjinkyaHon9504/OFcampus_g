// Company -> 2-3 decision-maker contacts with emails.
// FOUNDER route (YC / early / <=50 people): founders, co-founders, CTO, eng heads.
// HR route (unicorns, MNCs, listed): HR / talent acquisition + one engineering manager.
// MIXED: founders and HR.
import type { Company, Contact } from "@prisma/client";
import { prisma } from "./db";
import { decrypt } from "./crypto";
import { targetTitles, type Persona, type Route } from "./dataset";
import {
  apolloFindOrg, apolloMatch, apolloSearchPeople, fromApollo, hunterDomainSearch, hunterFindEmail, hunterVerify,
  ProviderError, type FoundPerson,
} from "./providers";

export interface Keys {
  apollo: string | null;
  hunter: string | null;
  gemini: string | null;
}

export async function keysFor(userId: string): Promise<Keys> {
  const s = await prisma.settings.findUnique({ where: { userId } });
  return {
    apollo: decrypt(s?.apolloKeyEnc) ?? (process.env.APOLLO_API_KEY || null),
    hunter: decrypt(s?.hunterKeyEnc) ?? (process.env.HUNTER_API_KEY || null),
    gemini: decrypt(s?.geminiKeyEnc) ?? (process.env.GEMINI_API_KEY || null),
  };
}

export const normName = (s: string) => s.toLowerCase().normalize("NFKD").replace(/[^a-z ]/g, "").replace(/\s+/g, " ").trim();
export const linkedinSlug = (u: string | null | undefined) => u?.match(/linkedin\.com\/in\/([^/?#]+)/i)?.[1]?.toLowerCase() ?? null;

// Same person if the LinkedIn slug matches, or full names match, or a one-word
// CSV name ("Sanket") equals the provider's first name.
export function samePerson(a: { name: string; linkedinUrl?: string | null }, b: { name: string; linkedinUrl?: string | null }): boolean {
  const sa = linkedinSlug(a.linkedinUrl);
  const sb = linkedinSlug(b.linkedinUrl);
  if (sa && sb) return sa === sb;
  const na = normName(a.name);
  const nb = normName(b.name);
  if (!na || !nb) return false;
  if (na === nb) return true;
  const [short, long] = na.split(" ").length < nb.split(" ").length ? [na, nb] : [nb, na];
  return short.split(" ").length === 1 && long.split(" ")[0] === short;
}

const PREFERENCE: Record<Route, Persona[]> = {
  FOUNDER: ["FOUNDER", "HIRING_MANAGER", "HR", "OTHER"],
  HR: ["HR", "HIRING_MANAGER", "FOUNDER", "OTHER"],
  MIXED: ["FOUNDER", "HR", "HIRING_MANAGER", "OTHER"],
};

// Rank candidates for a route: preferred persona first, then email quality.
// MIXED keeps at least one HR contact in the picks when one exists.
export function pickTargets(route: Route, people: FoundPerson[], want = 3): FoundPerson[] {
  const order = PREFERENCE[route];
  const score = (p: FoundPerson) => order.indexOf(p.persona) * 100 - p.confidence - (p.email ? 50 : 0);
  const sorted = [...people].sort((a, b) => score(a) - score(b));
  const seen = new Set<string>();
  const uniq = sorted.filter((p) => {
    const k = normName(p.name);
    if (!k || seen.has(k)) return false;
    seen.add(k);
    return true;
  });
  const picks = uniq.filter((p) => p.persona !== "OTHER").slice(0, want);
  if (route === "MIXED" && !picks.some((p) => p.persona === "HR")) {
    const hr = uniq.find((p) => p.persona === "HR");
    if (hr) picks.splice(Math.min(picks.length, want - 1), 1, hr);
  }
  return picks.length ? picks : uniq.slice(0, want);
}

function orgLooksRight(companyName: string, orgName: string): boolean {
  const a = normName(companyName.replace(/\(.*?\)/g, "").split("/")[0]).replace(/ (ai|app|labs|tech|technologies|india|pvt|ltd)$/g, "");
  const b = normName(orgName);
  return !!a && (b.includes(a) || a.includes(b));
}

export interface EnrichResult {
  company: string;
  added: number;
  withEmail: number;
  note: string;
}

// opts.route overrides the company's own route for this run, e.g. "HR" to fetch
// HR contacts at a startup whose route would normally pick founders.
export async function enrichCompany(
  userId: string,
  company: Company & { contacts: Contact[] },
  keys: Keys,
  opts: { want?: number; route?: Route } = {},
): Promise<EnrichResult> {
  if (!keys.apollo && !keys.hunter) throw new Error("Add an Apollo or Hunter API key in Settings first.");
  const route = opts.route ?? (company.route as Route);
  const want = opts.want ?? 3;
  const notes: string[] = [];
  let domain = company.domain;
  const found: FoundPerson[] = [];

  if (keys.apollo) {
    try {
      const org = await apolloFindOrg(keys.apollo, company.name, domain);
      if (org && (domain || orgLooksRight(company.name, org.name))) {
        domain = domain ?? org.primary_domain ?? null;
        const { titles, seniorities } = targetTitles(route);
        const people = await apolloSearchPeople(keys.apollo, org.id, titles, seniorities, 15);
        found.push(...people.map(fromApollo));

        // People named in the sheet or found by web research but not returned by search: look them up directly.
        for (const c of company.contacts.filter((c) => c.source === "csv" || c.source === "web")) {
          if (found.some((f) => samePerson(f, c))) continue;
          const [first, ...rest] = c.name.split(" ");
          if (!rest.length && !c.linkedinUrl) continue;
          const person = await apolloMatch(keys.apollo, {
            linkedin_url: c.linkedinUrl,
            first_name: c.linkedinUrl ? null : first,
            last_name: c.linkedinUrl ? null : rest.join(" "),
            domain,
            organization_name: company.name,
          });
          if (person) found.push(fromApollo(person));
        }

        // Reveal emails only for the people we'll actually contact (saves credits).
        for (const p of pickTargets(route, found, want)) {
          if (p.email || !p.providerId) continue;
          const m = await apolloMatch(keys.apollo, { id: p.providerId, domain });
          if (m) Object.assign(p, { ...fromApollo(m), persona: p.persona });
        }
      } else notes.push(org ? `Apollo matched "${org.name}" — skipped, name differs` : "Apollo: company not found");
    } catch (e) {
      notes.push(e instanceof ProviderError ? `Apollo error ${e.status}` : `Apollo unreachable (${e instanceof Error ? e.message : e})`);
    }
  }

  // Hunter: fill gaps when we still have fewer than 2 emails.
  if (keys.hunter && domain) {
    try {
      if (found.filter((f) => f.email).length < 2) {
        const depts = route === "HR" ? (["hr", "management"] as const) : (["executive", "hr"] as const);
        for (const d of depts) found.push(...(await hunterDomainSearch(keys.hunter, domain, d)));
      }
      for (const p of pickTargets(route, found, want)) {
        if (!p.email) {
          const r = await hunterFindEmail(keys.hunter, domain, p.firstName, p.lastName);
          if (r) Object.assign(p, { email: r.email, emailStatus: r.score >= 90 ? "verified" : "likely", confidence: r.score });
        } else if (p.emailStatus !== "verified") {
          p.emailStatus = await hunterVerify(keys.hunter, p.email);
        }
      }
    } catch (e) {
      notes.push(e instanceof ProviderError ? `Hunter error ${e.status}` : `Hunter unreachable (${e instanceof Error ? e.message : e})`);
    }
  } else if (!domain) notes.push("No company domain known — add it on the company to enable Hunter");

  // Sheet-named people we found with the provider are cross-verified.
  const targets = pickTargets(route, found, want);
  let added = 0;
  for (const p of targets) {
    const csvMatch = company.contacts.find((c) => samePerson(c, p));
    const data = {
      firstName: p.firstName,
      title: p.title || csvMatch?.title || "",
      persona: p.persona,
      // never wipe an email we already had (public careers address, manual entry)
      email: p.email ?? csvMatch?.email ?? null,
      emailStatus: p.email ? p.emailStatus : csvMatch?.email ? csvMatch.emailStatus : "none",
      phone: p.phone,
      linkedinUrl: p.linkedinUrl ?? csvMatch?.linkedinUrl ?? null,
      source: p.source,
      linkedinMatch: !!csvMatch,
      confidence: Math.min(100, p.confidence + (csvMatch ? 10 : 0)),
    };
    if (csvMatch) await prisma.contact.update({ where: { id: csvMatch.id }, data: { ...data, name: p.name || csvMatch.name } });
    else {
      await prisma.contact.upsert({
        where: { companyId_name: { companyId: company.id, name: p.name } },
        create: { userId, companyId: company.id, name: p.name, ...data },
        update: data,
      });
      added++;
    }
  }
  // Sheet/web-researched people the providers didn't return: try Hunter's finder by name.
  let extraEmails = 0;
  if (keys.hunter && domain) {
    for (const c of company.contacts) {
      if (c.email || (c.source !== "csv" && c.source !== "web") || targets.some((t) => samePerson(c, t))) continue;
      const [first, ...rest] = c.name.split(" ");
      const r = await hunterFindEmail(keys.hunter, domain, first, rest.join(" ")).catch(() => null);
      if (!r) continue;
      await prisma.contact.update({
        where: { id: c.id },
        data: { email: r.email, emailStatus: r.score >= 90 ? "verified" : "likely", confidence: r.score, linkedinUrl: c.linkedinUrl ?? r.linkedin },
      });
      extraEmails++;
    }
  }
  const withEmail = targets.filter((t) => t.email).length + extraEmails;
  const note = notes.join("; ") || `found ${targets.length} (${withEmail} with email)`;
  await prisma.company.update({ where: { id: company.id }, data: { domain, enrichedAt: new Date(), enrichNote: note } });
  return { company: company.name, added, withEmail, note };
}
