"use client";
import { useMemo, useState } from "react";
import { ContactTable, SendDialog, type ContactRow } from "@/components/contacts";
import { api, Modal, PageHeader, Toast, useData } from "@/components/ui";

const STATUSES = ["NEW", "QUEUED", "SENT", "FOLLOW_UP_DUE", "REPLIED", "BOUNCED", "DO_NOT_CONTACT"];

export default function Contacts() {
  const { data, reload } = useData<ContactRow[]>("/api/contacts");
  const companies = useData<{ id: string; name: string }[]>("/api/companies").data;
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("");
  const [persona, setPersona] = useState("");
  const [emailOnly, setEmailOnly] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [edit, setEdit] = useState<ContactRow | null>(null);
  const [adding, setAdding] = useState(false);
  const [sendOpen, setSendOpen] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  const rows = useMemo(() => {
    const needle = q.toLowerCase();
    return (data ?? []).filter(
      (c) =>
        (!needle || `${c.name} ${c.title} ${c.email ?? ""} ${c.company.name}`.toLowerCase().includes(needle)) &&
        (!status || c.status === status) && (!persona || c.persona === persona) && (!emailOnly || c.email),
    );
  }, [data, q, status, persona, emailOnly]);

  const ids = [...selected].filter((id) => rows.some((r) => r.id === id));
  const toggle = (id: string) => setSelected((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });

  async function save(patch: Partial<ContactRow>) {
    await api("/api/contacts", { method: "PATCH", body: { ids: [edit!.id], ...patch } });
    setEdit(null);
    reload();
  }
  async function bulk(body: Record<string, unknown>, method = "PATCH") {
    const r = await api<{ updated?: number; deleted?: number }>("/api/contacts", { method, body: { ids, ...body } });
    setToast(`${r.updated ?? r.deleted} contacts updated`);
    setSelected(new Set());
    reload();
  }

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader title="Contacts" subtitle={`${data?.length ?? 0} people · ${data?.filter((c) => c.email).length ?? 0} with email`}>
        <button className="btn-ghost" onClick={() => setAdding(true)}>Add contact</button>
        <a className="btn-ghost" href="/api/export?type=contacts">Download CSV</a>
      </PageHeader>

      <div className="mb-3 flex flex-wrap gap-2">
        <input className="input max-w-xs" placeholder="Search name, company, email…" value={q} onChange={(e) => setQ(e.target.value)} />
        <select className="input w-auto" value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="">Any status</option>
          {STATUSES.map((s) => <option key={s} value={s}>{s.replace(/_/g, " ").toLowerCase()}</option>)}
        </select>
        <select className="input w-auto" value={persona} onChange={(e) => setPersona(e.target.value)}>
          <option value="">Any role</option>
          <option value="FOUNDER">Founder</option>
          <option value="HIRING_MANAGER">Hiring manager</option>
          <option value="HR">HR</option>
          <option value="OTHER">Other</option>
        </select>
        <label className="flex items-center gap-1.5 text-sm text-slate-600">
          <input type="checkbox" checked={emailOnly} onChange={(e) => setEmailOnly(e.target.checked)} /> has email
        </label>
      </div>

      <div className="mb-3 flex flex-wrap items-center gap-2">
        <span className="text-sm text-slate-500">{ids.length} selected</span>
        <button className="btn-primary" disabled={!ids.length} onClick={() => setSendOpen(true)}>Preview &amp; send</button>
        <button className="btn-ghost" disabled={!ids.length} onClick={() => bulk({ status: "QUEUED" })}>Queue for daily run</button>
        <button className="btn-danger" disabled={!ids.length} onClick={() => confirm(`Delete ${ids.length} contacts?`) && bulk({}, "DELETE")}>Delete</button>
      </div>

      {data ? (
        <ContactTable rows={rows} selected={selected} onToggle={toggle}
          onToggleAll={() => setSelected(ids.length === rows.length ? new Set() : new Set(rows.map((r) => r.id)))} onEdit={setEdit} />
      ) : <p className="text-sm text-slate-500">Loading…</p>}

      <Modal open={!!edit} onClose={() => setEdit(null)} title={edit ? `${edit.name} · ${edit.company.name}` : ""}>
        {edit && <EditForm c={edit} onSave={save} />}
      </Modal>
      <Modal open={adding} onClose={() => setAdding(false)} title="Add contact">
        <AddForm companies={companies ?? []} onDone={() => { setAdding(false); reload(); }} />
      </Modal>
      <SendDialog ids={ids} open={sendOpen} onClose={() => setSendOpen(false)}
        onDone={(m) => { setSendOpen(false); setToast(m); setSelected(new Set()); reload(); }} />
      <Toast msg={toast} onClose={() => setToast(null)} />
    </div>
  );
}

function EditForm({ c, onSave }: { c: ContactRow; onSave: (p: Partial<ContactRow>) => void }) {
  const [f, setF] = useState({ email: c.email ?? "", title: c.title, persona: c.persona, status: c.status, linkedinUrl: c.linkedinUrl ?? "", notes: c.notes ?? "" });
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => setF({ ...f, [k]: e.target.value });
  return (
    <div className="space-y-3">
      <div><label className="label">Email</label><input className="input" value={f.email} onChange={set("email")} /></div>
      <div className="grid grid-cols-2 gap-3">
        <div><label className="label">Title</label><input className="input" value={f.title} onChange={set("title")} /></div>
        <div>
          <label className="label">Persona (picks template)</label>
          <select className="input" value={f.persona} onChange={set("persona")}>
            {["FOUNDER", "HIRING_MANAGER", "HR", "OTHER"].map((p) => <option key={p}>{p}</option>)}
          </select>
        </div>
      </div>
      <div>
        <label className="label">Status</label>
        <select className="input" value={f.status} onChange={set("status")}>
          {STATUSES.map((s) => <option key={s}>{s}</option>)}
        </select>
      </div>
      <div><label className="label">LinkedIn</label><input className="input" value={f.linkedinUrl} onChange={set("linkedinUrl")} /></div>
      <div><label className="label">Notes</label><textarea className="input h-20" value={f.notes} onChange={set("notes")} /></div>
      <div className="flex justify-end"><button className="btn-primary" onClick={() => onSave({ ...f, email: f.email || null })}>Save</button></div>
    </div>
  );
}

function AddForm({ companies, onDone }: { companies: { id: string; name: string }[]; onDone: () => void }) {
  const [f, setF] = useState({ companyId: "", name: "", title: "", email: "", linkedinUrl: "" });
  const [err, setErr] = useState("");
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setF({ ...f, [k]: e.target.value });
  return (
    <div className="space-y-3">
      <div>
        <label className="label">Company</label>
        <select className="input" value={f.companyId} onChange={set("companyId")}>
          <option value="">Choose…</option>
          {companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div><label className="label">Name</label><input className="input" value={f.name} onChange={set("name")} /></div>
        <div><label className="label">Title</label><input className="input" placeholder="e.g. Co-founder, HR" value={f.title} onChange={set("title")} /></div>
      </div>
      <div><label className="label">Email</label><input className="input" value={f.email} onChange={set("email")} /></div>
      <div><label className="label">LinkedIn</label><input className="input" value={f.linkedinUrl} onChange={set("linkedinUrl")} /></div>
      {err && <p className="text-sm text-rose-600">{err}</p>}
      <div className="flex justify-end">
        <button className="btn-primary" onClick={() => api("/api/contacts", { method: "POST", body: f }).then(onDone).catch((e: Error) => setErr(e.message))}>Add</button>
      </div>
    </div>
  );
}
