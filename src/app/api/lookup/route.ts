import { route } from "@/lib/api";
import { HttpError } from "@/lib/auth";
import { prisma } from "@/lib/db";
import type { Route } from "@/lib/dataset";
import { enrichCompany, keysFor } from "@/lib/enrich";

export const maxDuration = 60;

const PERSONAS: Record<Route, string[]> = {
  HR: ["HR"],
  FOUNDER: ["FOUNDER", "HIRING_MANAGER"],
  MIXED: ["FOUNDER", "HIRING_MANAGER", "HR"],
};

// On-demand lookup for one company (in your list or not): returns its HR or
// founder contacts with emails. Reuses saved contacts unless refresh is set,
// so repeat lookups don't spend provider credits.
export const POST = route(async (user, req) => {
  const b = (await req.json()) as { company?: string; domain?: string; focus?: Route; want?: number; refresh?: boolean };
  const name = b.company?.trim();
  if (!name) throw new HttpError(400, "Enter a company name");
  const focus: Route = b.focus && b.focus in PERSONAS ? b.focus : "HR";
  const domain = b.domain?.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/\/.*$/, "") || null;

  let company = await prisma.company.findFirst({ where: { userId: user.id, name: { equals: name, mode: "insensitive" } } });
  if (!company) {
    company = await prisma.company.create({
      data: { userId: user.id, name, domain, route: focus, group: "Lookup", status: "Not started" },
    });
  } else if (domain && domain !== company.domain) {
    company = await prisma.company.update({ where: { id: company.id }, data: { domain } });
  }

  const wanted = (c: { persona: string; email: string | null }) => PERSONAS[focus].includes(c.persona) && !!c.email;
  const saved = await prisma.contact.findMany({ where: { companyId: company.id } });
  let note = "Saved contacts (no credits used). Use “Search again” for fresh results.";
  let cached = true;
  if (b.refresh || !saved.some(wanted)) {
    const keys = await keysFor(user.id);
    const full = await prisma.company.findUniqueOrThrow({ where: { id: company.id }, include: { contacts: true } });
    const r = await enrichCompany(user.id, full, keys, { route: focus, want: Math.min(Math.max(b.want ?? 3, 1), 5) });
    note = r.note;
    cached = false;
    await prisma.run.create({ data: { userId: user.id, kind: "LOOKUP", summary: `${company.name} (${focus}): ${r.note}` } });
  }

  const contacts = await prisma.contact.findMany({
    where: { companyId: company.id },
    include: { company: { select: { name: true, priority: true, route: true, track: true, fitFor: true, category: true, roles: true } } },
  });
  const rank = (c: { persona: string; email: string | null }) => (PERSONAS[focus].includes(c.persona) ? 0 : 2) + (c.email ? 0 : 1);
  contacts.sort((a, b2) => rank(a) - rank(b2));
  const updated = await prisma.company.findUniqueOrThrow({ where: { id: company.id } });
  return { company: { id: updated.id, name: updated.name, domain: updated.domain }, focus, contacts, note, cached };
});
