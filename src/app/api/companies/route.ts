import { route } from "@/lib/api";
import { prisma } from "@/lib/db";

export const GET = route(async (user) => {
  const companies = await prisma.company.findMany({
    where: { userId: user.id },
    orderBy: [{ priority: "desc" }, { name: "asc" }],
    include: { contacts: { select: { email: true, status: true } } },
  });
  return companies.map(({ contacts, ...c }) => ({
    ...c,
    contactCount: contacts.length,
    emailCount: contacts.filter((x) => x.email).length,
    replied: contacts.some((x) => x.status === "REPLIED"),
  }));
});

export const PATCH = route(async (user, req) => {
  const { id, domain, route: r, track, status } = (await req.json()) as Record<string, string | undefined>;
  await prisma.company.updateMany({
    where: { id, userId: user.id },
    data: { domain: domain === undefined ? undefined : domain.trim().toLowerCase() || null, route: r, track, status },
  });
});
