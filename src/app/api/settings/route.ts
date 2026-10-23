import { route } from "@/lib/api";
import { encrypt } from "@/lib/crypto";
import { prisma } from "@/lib/db";

export const GET = route(async (user) => {
  const s = await prisma.settings.upsert({ where: { userId: user.id }, create: { userId: user.id, senderName: user.name }, update: {} });
  const { apolloKeyEnc, hunterKeyEnc, claudeKeyEnc, geminiKeyEnc, ...rest } = s;
  return {
    ...rest,
    email: user.email,
    hasApollo: !!apolloKeyEnc || !!process.env.APOLLO_API_KEY,
    hasHunter: !!hunterKeyEnc || !!process.env.HUNTER_API_KEY,
    hasClaude: !!claudeKeyEnc || !!process.env.ANTHROPIC_API_KEY,
    hasGemini: !!geminiKeyEnc || !!process.env.GEMINI_API_KEY,
  };
});

const TEXT = ["senderName", "phone", "githubUrl", "linkedinUrl", "portfolioUrl", "college", "pitch", "fitForFilter"] as const;
const NUM = ["followUpDays", "maxFollowUps", "dailyLimit"] as const;

export const PUT = route(async (user, req) => {
  const b = (await req.json()) as Record<string, unknown>;
  const data: Record<string, unknown> = {};
  for (const k of TEXT) if (typeof b[k] === "string") data[k] = (b[k] as string).trim();
  for (const k of NUM) if (b[k] != null) data[k] = Math.max(0, Math.min(200, Number(b[k]) || 0));
  if (typeof b.autoSendQueue === "boolean") data.autoSendQueue = b.autoSendQueue;
  // Keys are write-only: "" clears, undefined keeps.
  for (const [field, col] of [["apolloKey", "apolloKeyEnc"], ["hunterKey", "hunterKeyEnc"], ["claudeKey", "claudeKeyEnc"], ["geminiKey", "geminiKeyEnc"]] as const) {
    if (typeof b[field] === "string") data[col] = (b[field] as string).trim() ? encrypt((b[field] as string).trim()) : null;
  }
  await prisma.settings.upsert({ where: { userId: user.id }, create: { userId: user.id, ...data }, update: data });
});
