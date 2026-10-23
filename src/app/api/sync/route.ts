import { route } from "@/lib/api";
import { prisma } from "@/lib/db";
import { runDaily, syncReplies } from "@/lib/outreach";

export const maxDuration = 60;

// ?daily=1 also sends the queue (same as the cron), otherwise just checks replies.
export const POST = route(async (user, req) => {
  if (new URL(req.url).searchParams.get("daily")) return runDaily(user.id);
  const r = await syncReplies(user.id);
  await prisma.run.create({ data: { userId: user.id, kind: "SYNC", summary: `${r.replies} replies, ${r.bounces} bounces, ${r.followUpsDue} follow-ups due` } });
  return r;
});
