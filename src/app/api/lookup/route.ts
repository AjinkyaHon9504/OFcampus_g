import { route } from "@/lib/api";
import { HttpError } from "@/lib/auth";
import { prisma } from "@/lib/db";
import type { Route } from "@/lib/dataset";
import { enrichCompany, keysFor } from "@/lib/enrich";
import { geminiResearch } from "@/lib/research";

export const maxDuration = 60;

const PERSONAS: Record<Route, string[]> = {
  HR: ["HR"],
  FOUNDER: ["FOUNDER", "HIRING_MANAGER"],
  MIXED: ["FOUNDER", "HIRING_MANAGER", "HR"],
};

// On-demand lookup for one company (in your list or not):
// 1. Gemini + Google Search researches the company: website, LinkedIn page, and
//    names/titles of HR or founders from public pages (new companies, or "Search again").
// 2. Apollo/Hunter find and verify emails for those people and add their own matches.
// Saved contacts are reused unless refresh is set, so repeat lookups cost nothing.
export const POST = route(async (user, req) => {
  const b = (await req.json()) as { company?: string; domain?: string; focus?: Route; want?: number; refresh?: boolean };
  const name = b.company?.trim();
  if (!name) throw new HttpError(400, "Enter a company name");
  const focus: Route = b.focus && b.focus in PERSONAS ? b.focus : "HR";
  const want = Math.min(Math.max(b.want ?? 3, 1), 5);
  const domain = b.domain?.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/\/.*$/, "") || null;

  let company = await prisma.company.findFirst({ where: { userId: user.id, name: { equals: name, mode: "insensitive" } } });
  const isNew = !company;
  if (!company) {
    company = await prisma.company.create({
      data: { userId: user.id, name, domain, route: focus, group: "Lookup", status: "Not started" },
    });
  } else if (domain && domain !== company.domain) {
    company = await prisma.company.update({ where: { id: company.id }, data: { domain } });
  }

  const wanted = (c: { persona: string; email: string | null }) => PERSONAS[focus].includes(c.persona) && !!c.email;
  const saved = await prisma.contact.findMany({ where: { companyId: company.id } });
  const notes: string[] = [];
  let cached = true;

  if (b.refresh || !saved.some(wanted)) {
    cached = false;
    const keys = await keysFor(user.id);
    if (!keys.gemini && !keys.apollo && !keys.hunter) throw new HttpError(400, "Add a Gemini, Apollo or Hunter key in Settings first.");

    // Web research: always for companies outside your list, otherwise when asked to search again
    // or when the providers have nothing saved yet.
    if (keys.gemini && (isNew || b.refresh || saved.length === 0)) {
      try {
        const r = await geminiResearch(keys.gemini, name, company.domain, focus, want);
        company = await prisma.company.update({
          where: { id: company.id },
          data: {
            domain: company.domain ?? r.domain,
            linkedinUrl: company.linkedinUrl ?? r.linkedinUrl,
            ...(isNew ? { category: r.description, base: r.hq, stage: r.employees ? `~${r.employees} employees` : "" } : {}),
          },
        });
        for (const p of r.people) {
          const existing = saved.find((s) => s.name.toLowerCase() === p.name.toLowerCase());
          if (existing) continue;
          await prisma.contact.create({
            data: {
              userId: user.id, companyId: company.id, name: p.name, firstName: p.name.split(" ")[0], title: p.title,
              persona: p.persona, linkedinUrl: p.linkedinUrl, source: "web", sourceUrl: p.sourceUrl, confidence: 40,
            },
          });
        }
        for (const e of r.publicEmails) {
          await prisma.contact.upsert({
            where: { companyId_name: { companyId: company.id, name: `Careers inbox (${e.email})` } },
            create: {
              userId: user.id, companyId: company.id, name: `Careers inbox (${e.email})`, firstName: "Hiring Team", title: "Careers / HR inbox",
              persona: "HR", email: e.email, emailStatus: "unverified", source: "web", sourceUrl: e.sourceUrl, confidence: 50,
            },
            update: {},
          });
        }
        notes.push(`Web research: ${r.people.length} people, ${r.publicEmails.length} public emails${r.domain ? `, site ${r.domain}` : ""}`);
      } catch (e) {
        notes.push(e instanceof Error ? e.message : String(e));
      }
    }

    if (keys.apollo || keys.hunter) {
      const full = await prisma.company.findUniqueOrThrow({ where: { id: company.id }, include: { contacts: true } });
      const r = await enrichCompany(user.id, full, keys, { route: focus, want });
      notes.push(r.note);
    } else {
      notes.push("Add an Apollo or Hunter key in Settings to get emails for these people");
    }
    await prisma.run.create({ data: { userId: user.id, kind: "LOOKUP", summary: `${company.name} (${focus}): ${notes.join("; ")}` } });
  } else {
    notes.push("Saved contacts (no credits used). Use “Search again” for fresh results.");
  }

  const contacts = await prisma.contact.findMany({
    where: { companyId: company.id },
    include: { company: { select: { name: true, priority: true, route: true, track: true, fitFor: true, category: true, roles: true } } },
  });
  const rank = (c: { persona: string; email: string | null }) => (PERSONAS[focus].includes(c.persona) ? 0 : 2) + (c.email ? 0 : 1);
  contacts.sort((a, b2) => rank(a) - rank(b2));
  const updated = await prisma.company.findUniqueOrThrow({ where: { id: company.id } });
  return {
    company: { id: updated.id, name: updated.name, domain: updated.domain, linkedinUrl: updated.linkedinUrl, category: updated.category },
    focus, contacts, note: notes.join(" · "), cached,
  };
});
