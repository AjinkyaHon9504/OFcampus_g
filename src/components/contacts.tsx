"use client";
import { useEffect, useState } from "react";
import { api, Badge, Modal, timeAgo } from "./ui";

export interface ContactRow {
  id: string;
  name: string;
  title: string;
  persona: string;
  email: string | null;
  emailStatus: string;
  linkedinUrl: string | null;
  linkedinMatch: boolean;
  source: string;
  sourceUrl: string | null;
  confidence: number;
  status: string;
  threadId: string | null;
  lastContactedAt: string | null;
  repliedAt: string | null;
  followUps: number;
  notes: string | null;
  companyId: string;
  company: { name: string; priority: number; route: string; track: string; fitFor: string; category: string; roles: string };
}

export function ContactTable({
  rows, selected, onToggle, onToggleAll, onEdit,
}: {
  rows: ContactRow[];
  selected: Set<string>;
  onToggle: (id: string) => void;
  onToggleAll: () => void;
  onEdit?: (c: ContactRow) => void;
}) {
  const all = rows.length > 0 && rows.every((r) => selected.has(r.id));
  return (
    <div className="card overflow-x-auto">
      <table className="min-w-full divide-y divide-slate-100">
        <thead className="bg-slate-50/60">
          <tr>
            <th className="th w-8"><input type="checkbox" checked={all} onChange={onToggleAll} /></th>
            <th className="th">Person</th>
            <th className="th">Company</th>
            <th className="th">Email</th>
            <th className="th">Status</th>
            <th className="th">Last mail</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {rows.map((c) => (
            <tr key={c.id} className={selected.has(c.id) ? "bg-indigo-50/40" : "hover:bg-slate-50/60"}>
              <td className="td"><input type="checkbox" checked={selected.has(c.id)} onChange={() => onToggle(c.id)} /></td>
              <td className="td">
                <div className="flex items-center gap-1.5 font-medium">
                  {onEdit ? <button className="hover:text-indigo-700" onClick={() => onEdit(c)}>{c.name}</button> : c.name}
                  {c.linkedinUrl && (
                    <a href={c.linkedinUrl} target="_blank" rel="noreferrer" title={c.linkedinMatch ? "Same person in your sheet / web research and the provider" : "LinkedIn"} className="text-[11px] font-semibold text-sky-700">
                      in{c.linkedinMatch ? " ✓" : ""}
                    </a>
                  )}
                </div>
                <div className="mt-0.5 flex items-center gap-1.5 text-xs text-slate-500">
                  <Badge v={c.persona} /> {c.title}
                </div>
              </td>
              <td className="td">
                <div className="font-medium">{c.company.name}</div>
                <div className="mt-0.5 flex gap-1 text-xs text-slate-500">
                  <span title="priority">P{c.company.priority}</span>
                  <Badge v={c.company.route} /> <Badge v={c.company.track} />
                </div>
              </td>
              <td className="td">
                {c.email ? (
                  <>
                    <div className="font-mono text-xs">{c.email}</div>
                    <div className="mt-0.5"><Badge v={c.emailStatus} /> <span className="text-[11px] text-slate-400">{c.source}</span></div>
                  </>
                ) : (
                  <span className="text-xs text-slate-400">needs enrichment</span>
                )}
              </td>
              <td className="td"><Badge v={c.status} />{c.followUps > 0 && <span className="ml-1 text-[11px] text-slate-400">+{c.followUps} f/u</span>}</td>
              <td className="td whitespace-nowrap text-xs text-slate-500">
                {timeAgo(c.lastContactedAt)}
                {c.threadId && (
                  <a className="ml-2 text-indigo-600 hover:underline" target="_blank" rel="noreferrer" href={`https://mail.google.com/mail/u/0/#all/${c.threadId}`}>thread</a>
                )}
              </td>
            </tr>
          ))}
          {rows.length === 0 && (
            <tr><td className="td py-10 text-center text-slate-500" colSpan={6}>Nobody here.</td></tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

interface Draft {
  contactId: string;
  name: string;
  company: string;
  to?: string;
  kind?: string;
  subject?: string;
  text?: string;
  attachmentNames?: string[];
  templateName?: string;
  error?: string;
}

// Preview every mail (AI line included), edit if needed, then send.
export function SendDialog({ ids, open, onClose, onDone }: { ids: string[]; open: boolean; onClose: () => void; onDone: (msg: string) => void }) {
  const [drafts, setDrafts] = useState<Draft[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [i, setI] = useState(0);

  const key = ids.join(",");
  useEffect(() => {
    if (!open) return;
    setLoading(true);
    setDrafts(null);
    setI(0);
    api<Draft[]>("/api/drafts", { method: "POST", body: { contactIds: key.split(",") } })
      .then(setDrafts)
      .catch((e: Error) => setDrafts([{ contactId: "", name: "", company: "", error: e.message }]))
      .finally(() => setLoading(false));
  }, [open, key]);

  const d = drafts?.[i];
  const ok = drafts?.filter((x) => !x.error) ?? [];

  async function send() {
    setSending(true);
    try {
      const overrides = Object.fromEntries(ok.map((x) => [x.contactId, { subject: x.subject, text: x.text }]));
      const r = await api<{ ok: boolean; name: string; error?: string }[]>("/api/send", {
        method: "POST",
        body: { contactIds: ok.map((x) => x.contactId), overrides },
      });
      const failed = r.filter((x) => !x.ok);
      onDone(`Sent ${r.length - failed.length}/${r.length}${failed.length ? ` — ${failed.map((f) => `${f.name}: ${f.error}`).join("; ")}` : ""}`);
    } catch (e) {
      onDone((e as Error).message);
    } finally {
      setSending(false);
    }
  }

  const update = (patch: Partial<Draft>) => setDrafts((all) => all!.map((x, j) => (j === i ? { ...x, ...patch } : x)));

  return (
    <Modal open={open} onClose={onClose} title={`Preview ${ids.length} mail${ids.length === 1 ? "" : "s"}`} wide>
      {loading && <p className="py-10 text-center text-sm text-slate-500">Writing personalised drafts…</p>}
      {drafts && d && (
        <div>
          <div className="mb-3 flex items-center justify-between text-sm">
            <button className="btn-ghost" disabled={i === 0} onClick={() => setI(i - 1)}>← Prev</button>
            <span className="text-slate-500">{i + 1} / {drafts.length} · {d.name} @ {d.company}</span>
            <button className="btn-ghost" disabled={i === drafts.length - 1} onClick={() => setI(i + 1)}>Next →</button>
          </div>
          {d.error ? (
            <p className="rounded-lg bg-rose-50 p-3 text-sm text-rose-700">{d.error}</p>
          ) : (
            <div className="space-y-3">
              <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-500">
                <span>To: <b className="font-mono text-slate-700">{d.to}</b></span>
                <span>{d.kind === "FOLLOW_UP" ? "Follow-up (same thread)" : "First mail"}</span>
                <span>Template: {d.templateName}</span>
                <span>Attachments: {d.attachmentNames?.length ? d.attachmentNames.join(", ") : <b className="text-rose-600">none — upload resumes in Settings</b>}</span>
              </div>
              <input className="input font-medium" value={d.subject} onChange={(e) => update({ subject: e.target.value })} />
              <textarea className="input h-80 font-mono text-[13px] leading-relaxed" value={d.text} onChange={(e) => update({ text: e.target.value })} />
            </div>
          )}
          <div className="mt-4 flex justify-end gap-2">
            <button className="btn-ghost" onClick={onClose}>Cancel</button>
            <button className="btn-primary" disabled={sending || ok.length === 0} onClick={send}>
              {sending ? "Sending…" : `Send ${ok.length} now`}
            </button>
          </div>
        </div>
      )}
    </Modal>
  );
}
