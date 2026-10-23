import { route } from "@/lib/api";
import { prisma } from "@/lib/db";
import { sentToday } from "@/lib/outreach";

export const GET = route(async (user) => {
  const where = { userId: user.id };
  const [companies, enriched, byStatus, withEmail, replies, runs, today, settings] = await Promise.all([
    prisma.company.count({ where }),
    prisma.company.count({ where: { ...where, enrichedAt: { not: null } } }),
    prisma.contact.groupBy({ by: ["status"], where, _count: true }),
    prisma.contact.count({ where: { ...where, email: { not: null } } }),
    prisma.contact.findMany({
      where: { ...where, status: "REPLIED" },
      orderBy: { repliedAt: "desc" },
      take: 10,
      select: { id: true, name: true, title: true, email: true, replySnippet: true, repliedAt: true, threadId: true, company: { select: { name: true } } },
    }),
    prisma.run.findMany({ where, orderBy: { at: "desc" }, take: 8 }),
    sentToday(user.id),
    prisma.settings.findUnique({ where }),
  ]);
  const count = Object.fromEntries(byStatus.map((s) => [s.status, s._count]));
  const contacted = (count.SENT ?? 0) + (count.FOLLOW_UP_DUE ?? 0) + (count.REPLIED ?? 0) + (count.BOUNCED ?? 0);
  return {
    companies, enriched, withEmail, count, contacted,
    replyRate: contacted ? Math.round(((count.REPLIED ?? 0) / contacted) * 100) : 0,
    replies, runs, sentToday: today, dailyLimit: settings?.dailyLimit ?? 25,
  };
});
