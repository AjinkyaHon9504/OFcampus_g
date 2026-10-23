"use client";
import { useEffect, useState } from "react";
import { api, PageHeader, Toast, useData } from "@/components/ui";

interface S {
  email: string;
  senderName: string;
  phone: string;
  githubUrl: string;
  linkedinUrl: string;
  portfolioUrl: string;
  college: string;
  pitch: string;
  fitForFilter: string;
  followUpDays: number;
  maxFollowUps: number;
  dailyLimit: number;
  autoSendQueue: boolean;
  hasApollo: boolean;
  hasHunter: boolean;
  hasClaude: boolean;
  hasGemini: boolean;
}
interface Att { id: string; kind: string; filename: string }

export default function Settings() {
  const { data, reload } = useData<S>("/api/settings");
  const att = useData<Att[]>("/api/attachments");
  const [f, setF] = useState<S | null>(null);
  const [keys, setKeys] = useState({ apolloKey: "", hunterKey: "", claudeKey: "", geminiKey: "" });
  const [toast, setToast] = useState<string | null>(null);
  useEffect(() => { if (data) setF(data); }, [data]);
  if (!f) return <p className="text-sm text-slate-500">Loading…</p>;

  const text = (k: keyof S, label: string, ph = "") => (
    <div><label className="label">{label}</label><input className="input" placeholder={ph} value={String(f[k] ?? "")} onChange={(e) => setF({ ...f, [k]: e.target.value })} /></div>
  );

  async function save() {
    const body: Record<string, unknown> = { ...f };
    for (const [k, v] of Object.entries(keys)) if (v) body[k] = v;
    await api("/api/settings", { method: "PUT", body });
    setKeys({ apolloKey: "", hunterKey: "", claudeKey: "", geminiKey: "" });
    setToast("Settings saved");
    reload();
  }
  async function upload(kind: string, file: File) {
    const form = new FormData();
    form.append("file", file);
    form.append("kind", kind);
    try {
      await api("/api/attachments", { method: "POST", body: form });
      att.reload();
    } catch (e) {
      setToast((e as Error).message);
    }
  }
  const fileFor = (kind: string) => att.data?.filter((a) => a.kind === kind) ?? [];

  return (
    <div className="mx-auto max-w-4xl space-y-5">
      <PageHeader title="Settings" subtitle={`Signed in as ${f.email}. Mails are sent from this Gmail.`}>
        <button className="btn-primary" onClick={save}>Save</button>
      </PageHeader>

      <section className="card space-y-3 p-5">
        <h2 className="font-semibold">About you (used in every template)</h2>
        <div className="grid gap-3 md:grid-cols-2">
          {text("senderName", "Your name")}
          {text("phone", "Contact number", "+91 …")}
          {text("college", "College / degree line", "B.E. CSE '27, Thapar Institute")}
          {text("githubUrl", "GitHub", "https://github.com/…")}
          {text("linkedinUrl", "LinkedIn", "https://linkedin.com/in/…")}
          {text("portfolioUrl", "Portfolio (optional)")}
        </div>
        <div>
          <label className="label">Your pitch — 2-3 sentences ({"{{pitch}}"})</label>
          <textarea className="input h-24" value={f.pitch} onChange={(e) => setF({ ...f, pitch: e.target.value })}
            placeholder="I built Verve, a video pipeline (FFmpeg + transcripts) used by … I've shipped …" />
        </div>
      </section>

      <section className="card space-y-3 p-5">
        <h2 className="font-semibold">Resumes &amp; attachments</h2>
        {[["TECH_RESUME", "Tech resume (SDE / AI roles)"], ["NONTECH_RESUME", "Non-tech resume (PM / consulting / analyst)"], ["OTHER", "Other attachments (sent with every mail)"]].map(([kind, label]) => (
          <div key={kind} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-100 p-3">
            <div>
              <div className="text-sm font-medium">{label}</div>
              <div className="text-xs text-slate-500">
                {fileFor(kind).length ? fileFor(kind).map((a) => (
                  <span key={a.id} className="mr-2">{a.filename} <button className="text-rose-600" onClick={() => api("/api/attachments", { method: "DELETE", body: { id: a.id } }).then(att.reload)}>remove</button></span>
                )) : "Not uploaded"}
              </div>
            </div>
            <input type="file" accept=".pdf,.doc,.docx" className="text-xs" onChange={(e) => e.target.files?.[0] && upload(kind, e.target.files[0])} />
          </div>
        ))}
      </section>

      <section className="card space-y-3 p-5">
        <h2 className="font-semibold">Daily trigger &amp; follow-ups</h2>
        <div className="grid gap-3 md:grid-cols-4">
          <div><label className="label">Daily send limit</label><input type="number" className="input" value={f.dailyLimit} onChange={(e) => setF({ ...f, dailyLimit: Number(e.target.value) })} /></div>
          <div><label className="label">Follow up after (days)</label><input type="number" className="input" value={f.followUpDays} onChange={(e) => setF({ ...f, followUpDays: Number(e.target.value) })} /></div>
          <div><label className="label">Max follow-ups</label><input type="number" className="input" value={f.maxFollowUps} onChange={(e) => setF({ ...f, maxFollowUps: Number(e.target.value) })} /></div>
          {text("fitForFilter", "Default 'Fit for' filter", "e.g. Ajinkya")}
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={f.autoSendQueue} onChange={(e) => setF({ ...f, autoSendQueue: e.target.checked })} />
          Daily 9:00 AM IST run sends everyone in the queue (otherwise it only checks replies and flags follow-ups)
        </label>
        <p className="text-xs text-slate-500">Keep the limit modest (20–40/day). New Gmail accounts sending lots of cold mail get rate-limited or flagged.</p>
      </section>

      <section className="card space-y-3 p-5">
        <h2 className="font-semibold">API keys <span className="text-xs font-normal text-slate-500">(encrypted; leave blank to keep the saved one)</span></h2>
        {([
          ["apolloKey", "Apollo.io — finds founders/HR + work emails", f.hasApollo],
          ["hunterKey", "Hunter.io — fallback finder + email verification", f.hasHunter],
          ["claudeKey", "Anthropic (Claude) — writes the personalised opening line", f.hasClaude],
          ["geminiKey", "Google Gemini — web research on Find contact for companies outside your list", f.hasGemini],
        ] as const).map(([k, label, has]) => (
          <div key={k}>
            <label className="label">{label} {has && <span className="ml-1 normal-case text-emerald-600">✓ saved</span>}</label>
            <input className="input font-mono" type="password" placeholder={has ? "••••••••  (saved)" : "paste key"} value={keys[k]} onChange={(e) => setKeys({ ...keys, [k]: e.target.value })} />
          </div>
        ))}
      </section>
      <Toast msg={toast} onClose={() => setToast(null)} />
    </div>
  );
}
