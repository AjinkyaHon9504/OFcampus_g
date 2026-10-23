import Papa from "papaparse";
import { route } from "@/lib/api";
import { prisma } from "@/lib/db";

export const GET = route(async (user, req) => {
  const type = new URL(req.url).searchParams.get("type") ?? "contacts";
  let rows: Record<string, unknown>[];
  if (type === "companies") {
    const cs = await prisma.company.findMany({ where: { userId: user.id }, orderBy: { priority: "desc" }, include: { contacts: true } });
    rows = cs.map((c) => ({
      priority: c.priority, company: c.name, route: c.route, resume: c.track, team_size: c.teamSize ?? "", domain: c.domain ?? "",
      type: c.type, group: c.group, stage: c.stage, roles: c.roles, fit_for: c.fitFor, hiring_signal: c.hiringSignal,
      base: c.base, contacts: c.contacts.length, with_email: c.contacts.filter((x) => x.email).length, status: c.status,
      enriched: c.enrichedAt?.toISOString() ?? "", enrich_note: c.enrichNote ?? "", source: c.sourceUrl,
    }));
  } else {
    const cs = await prisma.contact.findMany({ where: { userId: user.id }, include: { company: true }, orderBy: [{ company: { priority: "desc" } }] });
    rows = cs.map((c) => ({
      company: c.company.name, priority: c.company.priority, route: c.company.route, name: c.name, title: c.title, persona: c.persona,
      email: c.email ?? "", email_status: c.emailStatus, phone: c.phone ?? "", linkedin: c.linkedinUrl ?? "",
      linkedin_cross_checked: c.linkedinMatch ? "yes" : "", source: c.source, confidence: c.confidence, status: c.status,
      last_contacted: c.lastContactedAt?.toISOString() ?? "", replied_at: c.repliedAt?.toISOString() ?? "",
      follow_ups: c.followUps, domain: c.company.domain ?? "", fit_for: c.company.fitFor,
    }));
  }
  return new Response(Papa.unparse(rows), {
    headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="${type}.csv"` },
  });
});
