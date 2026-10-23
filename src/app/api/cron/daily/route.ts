import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { runDaily } from "@/lib/outreach";

export const maxDuration = 300;

// Vercel Cron: syncs replies, flags follow-ups and sends each user's queue.
export async function GET(req: Request) {
  if (req.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const users = await prisma.user.findMany({ where: { accounts: { some: { provider: "google" } } }, select: { id: true, email: true } });
  const results = [];
  for (const u of users) {
    try {
      results.push({ user: u.email, ...(await runDaily(u.id)) });
    } catch (e) {
      results.push({ user: u.email, error: e instanceof Error ? e.message : String(e) });
      await prisma.run.create({ data: { userId: u.id, kind: "CRON", summary: `failed: ${String(e).slice(0, 500)}` } });
    }
  }
  return NextResponse.json({ users: results.length, results: results.map((r) => ({ user: r.user, summary: "summary" in r ? r.summary : r.error })) });
}
