import { route } from "@/lib/api";
import { prisma } from "@/lib/db";
import { sendTo } from "@/lib/outreach";

export const maxDuration = 60;

export const POST = route(async (user, req) => {
  const { contactIds, overrides } = (await req.json()) as {
    contactIds: string[];
    overrides?: Record<string, { subject?: string; text?: string }>;
  };
  const results = await sendTo(user.id, contactIds.slice(0, 30), overrides);
  await prisma.run.create({
    data: { userId: user.id, kind: "SEND", summary: `Sent ${results.filter((r) => r.ok).length}/${results.length}` },
  });
  return results;
});
