import { route } from "@/lib/api";
import { prisma } from "@/lib/db";
import type { Route } from "@/lib/dataset";
import { enrichCompany, keysFor } from "@/lib/enrich";

export const maxDuration = 60;

// Body: { companyIds?: string[], batch?: number, force?: boolean, route?: "HR" | "FOUNDER" | "MIXED" }
// Without ids, takes the highest-priority companies not yet enriched. The UI calls
// this repeatedly so each request stays inside the serverless time limit.
export const POST = route(async (user, req) => {
  const b = (await req.json().catch(() => ({}))) as { companyIds?: string[]; batch?: number; force?: boolean; fitFor?: string; route?: Route };
  const routeOverride = b.route && ["HR", "FOUNDER", "MIXED"].includes(b.route) ? b.route : undefined;
  const keys = await keysFor(user.id);
  const batch = Math.min(b.batch ?? 3, 10);
  const companies = await prisma.company.findMany({
    where: {
      userId: user.id,
      ...(b.companyIds?.length ? { id: { in: b.companyIds } } : {}),
      ...(b.force || b.companyIds?.length ? {} : { enrichedAt: null }),
      ...(b.fitFor ? { OR: [{ fitFor: { contains: b.fitFor, mode: "insensitive" as const } }, { fitFor: "Both" }] } : {}),
    },
    include: { contacts: true },
    orderBy: { priority: "desc" },
    take: batch,
  });
  const results = [];
  for (const c of companies) {
    try {
      results.push(await enrichCompany(user.id, c, keys, { route: routeOverride }));
    } catch (e) {
      results.push({ company: c.name, added: 0, withEmail: 0, note: e instanceof Error ? e.message : String(e) });
      if (String(e).includes("API key")) break;
    }
  }
  const remaining = await prisma.company.count({ where: { userId: user.id, enrichedAt: null } });
  if (results.length) {
    await prisma.run.create({
      data: { userId: user.id, kind: "ENRICH", summary: results.map((r) => `${r.company}: ${r.note}`).join(" | ").slice(0, 2000) },
    });
  }
  return { results, remaining };
});
