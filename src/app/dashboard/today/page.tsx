"use client";
import { useMemo, useState } from "react";
import { ContactTable, SendDialog, type ContactRow } from "@/components/contacts";
import { api, PageHeader, Toast, useData } from "@/components/ui";

const TABS = [
  ["ready", "Ready to mail", (c: ContactRow) => c.status === "NEW" && !!c.email],
  ["followup", "Follow-ups due", (c: ContactRow) => c.status === "FOLLOW_UP_DUE"],
  ["queued", "Queued for daily run", (c: ContactRow) => c.status === "QUEUED"],
  ["waiting", "Awaiting reply", (c: ContactRow) => c.status === "SENT"],
] as const;

export default function Today() {
  const { data, reload } = useData<ContactRow[]>("/api/contacts");
  const settings = useData<{ fitForFilter: string; dailyLimit: number }>("/api/settings").data;
  const [tab, setTab] = useState<(typeof TABS)[number][0]>("ready");
  const [fit, setFit] = useState<string | null>(null);
  const [persona, setPersona] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [sendOpen, setSendOpen] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  const fitFilter = fit ?? settings?.fitForFilter ?? "";
  const rows = useMemo(() => {
    const test = TABS.find((t) => t[0] === tab)![2];
    return (data ?? []).filter(
      (c) => test(c) && (!persona || c.persona === persona) &&
        (!fitFilter || c.company.fitFor.toLowerCase().includes(fitFilter.toLowerCase()) || c.company.fitFor === "Both"),
    );
  }, [data, tab, persona, fitFilter]);
  const fits = useMemo(() => [...new Set((data ?? []).map((c) => c.company.fitFor).filter((f) => f && f !== "Both"))], [data]);

  const ids = [...selected].filter((id) => rows.some((r) => r.id === id));
  const toggle = (id: string) => setSelected((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const toggleAll = () => setSelected(ids.length === rows.length ? new Set() : new Set(rows.map((r) => r.id)));

  async function setStatus(status: string, list = ids) {
    const r = await api<{ updated: number }>("/api/contacts", { method: "PATCH", body: { ids: list, status } });
    setToast(`${r.updated} updated`);
    setSelected(new Set());
    reload();
  }
  async function unqueue() {
    const sel = rows.filter((r) => selected.has(r.id));
    const mailed = sel.filter((r) => r.threadId).map((r) => r.id);
    const fresh = sel.filter((r) => !r.threadId).map((r) => r.id);
    if (mailed.length) await api("/api/contacts", { method: "PATCH", body: { ids: mailed, status: "SENT" } });
    if (fresh.length) await api("/api/contacts", { method: "PATCH", body: { ids: fresh, status: "NEW" } });
    setSelected(new Set());
    reload();
  }

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader title="Today" subtitle={`Pick who to mail. Send now, or queue them for the daily 9:00 AM IST run (limit ${settings?.dailyLimit ?? 25}/day).`}>
        <select className="input w-auto" value={persona} onChange={(e) => setPersona(e.target.value)}>
          <option value="">All people</option>
          <option value="FOUNDER">Founders</option>
          <option value="HIRING_MANAGER">Hiring managers</option>
          <option value="HR">HR</option>
        </select>
        <select className="input w-auto" value={fitFilter} onChange={(e) => setFit(e.target.value)}>
          <option value="">Fit: everyone</option>
          {fits.map((f) => <option key={f} value={f}>Fit: {f}</option>)}
        </select>
      </PageHeader>

      <div className="mb-3 flex flex-wrap gap-1 border-b border-slate-200">
        {TABS.map(([k, label, test]) => (
          <button
            key={k}
            onClick={() => { setTab(k); setSelected(new Set()); }}
            className={`-mb-px border-b-2 px-3 py-2 text-sm font-medium ${tab === k ? "border-indigo-600 text-indigo-700" : "border-transparent text-slate-500 hover:text-slate-800"}`}
          >
            {label} <span className="ml-1 rounded-full bg-slate-100 px-1.5 text-xs">{(data ?? []).filter(test).length}</span>
          </button>
        ))}
      </div>

      <div className="mb-3 flex flex-wrap items-center gap-2">
        <span className="text-sm text-slate-500">{ids.length} selected</span>
        {tab !== "waiting" && (
          <button className="btn-primary" disabled={!ids.length} onClick={() => setSendOpen(true)}>
            Preview &amp; send {tab === "followup" ? "follow-ups" : ""}
          </button>
        )}
        {(tab === "ready" || tab === "followup") && (
          <button className="btn-ghost" disabled={!ids.length} onClick={() => setStatus("QUEUED")}>Queue for daily run</button>
        )}
        {tab === "queued" && <button className="btn-ghost" disabled={!ids.length} onClick={unqueue}>Remove from queue</button>}
        {tab === "waiting" && <button className="btn-ghost" disabled={!ids.length} onClick={() => setStatus("FOLLOW_UP_DUE")}>Follow up early</button>}
        <button className="btn-ghost" disabled={!ids.length} onClick={() => setStatus("REPLIED")}>Mark replied</button>
        <button className="btn-danger" disabled={!ids.length} onClick={() => setStatus("DO_NOT_CONTACT")}>Do not contact</button>
      </div>

      {data ? <ContactTable rows={rows} selected={selected} onToggle={toggle} onToggleAll={toggleAll} /> : <p className="text-sm text-slate-500">Loading…</p>}

      <SendDialog
        ids={ids}
        open={sendOpen}
        onClose={() => setSendOpen(false)}
        onDone={(m) => { setSendOpen(false); setToast(m); setSelected(new Set()); reload(); }}
      />
      <Toast msg={toast} onClose={() => setToast(null)} />
    </div>
  );
}
