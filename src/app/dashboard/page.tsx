"use client";
import Link from "next/link";
import { useState } from "react";
import { api, Badge, PageHeader, Stat, timeAgo, Toast, useData } from "@/components/ui";

interface Stats {
  companies: number;
  enriched: number;
  withEmail: number;
  contacted: number;
  replyRate: number;
  sentToday: number;
  dailyLimit: number;
  count: Record<string, number>;
  replies: { id: string; name: string; title: string; email: string; replySnippet: string; repliedAt: string; threadId: string; company: { name: string } }[];
  runs: { id: string; kind: string; summary: string; at: string }[];
}

export default function Overview() {
  const { data: s, reload } = useData<Stats>("/api/stats");
  const [busy, setBusy] = useState("");
  const [toast, setToast] = useState<string | null>(null);

  async function run(kind: "sync" | "daily") {
    setBusy(kind);
    try {
      const r = await api<{ summary?: string; replies?: number; followUpsDue?: number }>(`/api/sync${kind === "daily" ? "?daily=1" : ""}`, { method: "POST" });
      setToast(r.summary ?? `${r.replies} new replies, ${r.followUpsDue} follow-ups due`);
      reload();
    } catch (e) {
      setToast((e as Error).message);
    } finally {
      setBusy("");
    }
  }

  if (!s) return <div className="text-sm text-slate-500">Loading…</div>;
  const c = s.count;
  const empty = s.companies === 0;

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader title="Overview" subtitle={`${s.sentToday}/${s.dailyLimit} mails sent today`}>
        <button className="btn-ghost" disabled={!!busy} onClick={() => run("sync")}>{busy === "sync" ? "Checking…" : "Check replies"}</button>
        <button className="btn-primary" disabled={!!busy} onClick={() => run("daily")}>{busy === "daily" ? "Running…" : "Run daily trigger now"}</button>
      </PageHeader>

      {empty && (
        <div className="card mb-6 border-indigo-200 bg-indigo-50/50 p-5">
          <h2 className="font-semibold">Get started in 4 steps</h2>
          <ol className="mt-2 list-decimal space-y-1 pl-5 text-sm text-slate-700">
            <li><Link className="text-indigo-700 underline" href="/dashboard/settings">Settings</Link>: your phone, GitHub, pitch, Apollo/Hunter key, and upload tech + non-tech resumes.</li>
            <li><Link className="text-indigo-700 underline" href="/dashboard/companies">Companies</Link>: import your company CSV.</li>
            <li>Click <b>Find contacts</b> to pull 2–3 founders / HR per company with emails.</li>
            <li><Link className="text-indigo-700 underline" href="/dashboard/today">Today</Link>: pick who to mail, preview, send — or queue for the daily 9 AM run.</li>
          </ol>
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Companies" value={s.companies} hint={`${s.enriched} enriched`} />
        <Stat label="Contacts with email" value={s.withEmail} />
        <Stat label="Contacted" value={s.contacted} hint={`${c.QUEUED ?? 0} queued`} />
        <Stat label="Replied" value={c.REPLIED ?? 0} hint={`${s.replyRate}% reply rate`} />
      </div>
      <div className="mt-3 grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Ready to mail" value={c.NEW ?? 0} />
        <Stat label="Follow-ups due" value={c.FOLLOW_UP_DUE ?? 0} />
        <Stat label="Awaiting reply" value={c.SENT ?? 0} />
        <Stat label="Bounced" value={c.BOUNCED ?? 0} />
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        <section className="card lg:col-span-2">
          <div className="border-b border-slate-100 px-4 py-3 font-semibold">Latest replies</div>
          {s.replies.length === 0 ? (
            <p className="px-4 py-6 text-sm text-slate-500">No replies yet. They appear here after “Check replies” or the daily run.</p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {s.replies.map((r) => (
                <li key={r.id} className="px-4 py-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="text-sm font-medium">
                      {r.name} <span className="font-normal text-slate-500">· {r.title} · {r.company.name}</span>
                    </div>
                    <div className="flex items-center gap-2 text-xs text-slate-500">
                      {timeAgo(r.repliedAt)}
                      <a className="text-indigo-600 hover:underline" target="_blank" rel="noreferrer" href={`https://mail.google.com/mail/u/0/#all/${r.threadId}`}>Open in Gmail</a>
                    </div>
                  </div>
                  <p className="mt-1 line-clamp-2 text-sm text-slate-600">{r.replySnippet}</p>
                </li>
              ))}
            </ul>
          )}
        </section>
        <section className="card">
          <div className="border-b border-slate-100 px-4 py-3 font-semibold">Activity</div>
          <ul className="divide-y divide-slate-100">
            {s.runs.map((r) => (
              <li key={r.id} className="px-4 py-2.5 text-sm">
                <div className="flex items-center justify-between"><Badge v={r.kind} /><span className="text-xs text-slate-400">{timeAgo(r.at)}</span></div>
                <p className="mt-1 line-clamp-3 text-xs text-slate-600">{r.summary}</p>
              </li>
            ))}
            {s.runs.length === 0 && <li className="px-4 py-6 text-sm text-slate-500">Nothing yet.</li>}
          </ul>
        </section>
      </div>
      <Toast msg={toast} onClose={() => setToast(null)} />
    </div>
  );
}
