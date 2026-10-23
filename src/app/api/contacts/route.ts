import { route } from "@/lib/api";
import { HttpError } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { personaFor } from "@/lib/dataset";

export const GET = route(async (user) => {
  return prisma.contact.findMany({
    where: { userId: user.id },
    include: { company: { select: { name: true, priority: true, route: true, track: true, fitFor: true, category: true, roles: true } } },
    orderBy: [{ company: { priority: "desc" } }, { company: { name: "asc" } }, { name: "asc" }],
  });
});

export const POST = route(async (user, req) => {
  const b = (await req.json()) as { companyId: string; name: string; title?: string; email?: string; linkedinUrl?: string };
  if (!b.companyId || !b.name?.trim()) throw new HttpError(400, "companyId and name are required");
  const company = await prisma.company.findFirst({ where: { id: b.companyId, userId: user.id } });
  if (!company) throw new HttpError(404, "Company not found");
  const name = b.name.trim();
  return prisma.contact.create({
    data: {
      userId: user.id, companyId: company.id, name, firstName: name.split(" ")[0], title: b.title ?? "",
      persona: personaFor(b.title ?? ""), email: b.email?.trim().toLowerCase() || null,
      emailStatus: b.email ? "unverified" : "none", linkedinUrl: b.linkedinUrl || null, source: "manual",
    },
  });
});

const EDITABLE = ["email", "status", "title", "persona", "notes", "linkedinUrl", "phone", "emailStatus"] as const;

// Body: { ids: string[], ...fields }  (bulk) — e.g. { ids, status: "QUEUED" }
export const PATCH = route(async (user, req) => {
  const b = (await req.json()) as { ids: string[] } & Partial<Record<(typeof EDITABLE)[number], string>>;
  const data: Record<string, string | null> = {};
  for (const k of EDITABLE) if (k in b) data[k] = b[k] === "" ? null : (b[k] as string);
  if (data.email) data.email = data.email.trim().toLowerCase();
  if ("email" in data && !("emailStatus" in data)) data.emailStatus = data.email ? "unverified" : "none";
  if (data.status === "QUEUED") {
    // Never queue someone who already replied or opted out.
    const r = await prisma.contact.updateMany({
      where: { id: { in: b.ids }, userId: user.id, email: { not: null }, status: { notIn: ["REPLIED", "DO_NOT_CONTACT", "BOUNCED"] } },
      data,
    });
    return { updated: r.count };
  }
  const r = await prisma.contact.updateMany({ where: { id: { in: b.ids }, userId: user.id }, data });
  return { updated: r.count };
});

export const DELETE = route(async (user, req) => {
  const { ids } = (await req.json()) as { ids: string[] };
  const r = await prisma.contact.deleteMany({ where: { id: { in: ids }, userId: user.id } });
  return { deleted: r.count };
});
