"use client";
import { useEffect, useMemo, useState } from "react";
import { api, PageHeader, Toast, useData } from "@/components/ui";
import { buildVars, render, VARIABLES } from "@/lib/render";

interface Tpl {
  id?: string;
  name: string;
  persona: string;
  subject: string;
  body: string;
  attachTech: boolean;
  attachNonTech: boolean;
  autoResume: boolean;
  useAI: boolean;
}

const PERSONA_LABEL: Record<string, string> = {
  FOUNDER: "Founders / co-founders / CTO",
  HIRING_MANAGER: "Hiring & engineering managers",
  HR: "HR / talent acquisition",
  FOLLOW_UP: "Follow-up (sent in the same thread)",
};

const BLANK: Tpl = { name: "New template", persona: "FOUNDER", subject: "", body: "", attachTech: true, attachNonTech: false, autoResume: true, useAI: false };

export default function Templates() {
  const { data, reload } = useData<Tpl[]>("/api/templates");
  const settings = useData<Record<string, string>>("/api/settings").data;
  const [cur, setCur] = useState<Tpl | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    if (data && !cur) setCur(data[0] ?? BLANK);
  }, [data, cur]);

  const preview = useMemo(() => {
    if (!cur) return null;
    const sample = cur.persona === "HR" ? { name: "Priya Sharma", firstName: "Priya", title: "Talent Acquisition Lead" } : { name: "Saksham Aggarwal", firstName: "Saksham", title: "Co-founder & CEO" };
    const vars = buildVars(sample, { name: "Cardboard", category: "AI video editing", roles: "SDE, Founding eng" }, settings as never,
      cur.useAI ? "[Claude writes one specific opening line here for each company, from your sheet's notes + hiring signal]" : null);
    return { subject: render(cur.subject, vars), body: render(cur.body, vars) };
  }, [cur, settings]);

  async function save() {
    const saved = await api<Tpl>("/api/templates", { method: "PUT", body: cur });
    setCur(saved);
    setToast("Template saved");
    reload();
  }
  async function remove() {
    if (!cur?.id || !confirm(`Delete "${cur.name}"?`)) return;
    await api("/api/templates", { method: "DELETE", body: { id: cur.id } });
    setCur(null);
    reload();
  }

  const set = <K extends keyof Tpl>(k: K, v: Tpl[K]) => setCur((c) => ({ ...c!, [k]: v }));

  return (
    <div className="mx-auto max-w-7xl">
      <PageHeader title="Templates" subtitle="One template per kind of person. The right one is picked automatically from each contact's role.">
        <button className="btn-ghost" onClick={() => setCur({ ...BLANK })}>New template</button>
        <button className="btn-ghost" onClick={() => api("/api/templates", { method: "POST" }).then(reload)}>Restore defaults</button>
      </PageHeader>
      <div className="grid gap-5 lg:grid-cols-[220px_1fr_1fr]">
        <div className="card h-fit divide-y divide-slate-100">
          {(data ?? []).map((t) => (
            <button key={t.id} onClick={() => setCur(t)} className={`block w-full px-4 py-3 text-left ${cur?.id === t.id ? "bg-indigo-50" : "hover:bg-slate-50"}`}>
              <div className="text-sm font-medium">{t.name}</div>
              <div className="text-xs text-slate-500">{PERSONA_LABEL[t.persona]}</div>
            </button>
          ))}
        </div>

        {cur && (
          <div className="card space-y-3 p-4">
            <div className="grid grid-cols-2 gap-3">
              <div><label className="label">Name</label><input className="input" value={cur.name} onChange={(e) => set("name", e.target.value)} /></div>
              <div>
                <label className="label">Used for</label>
                <select className="input" value={cur.persona} onChange={(e) => set("persona", e.target.value)}>
                  {Object.entries(PERSONA_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select>
              </div>
            </div>
            <div><label className="label">Subject</label><input className="input" value={cur.subject} onChange={(e) => set("subject", e.target.value)} /></div>
            <div><label className="label">Body</label><textarea className="input h-80 font-mono text-[13px] leading-relaxed" value={cur.body} onChange={(e) => set("body", e.target.value)} /></div>
            <div className="flex flex-wrap gap-1">
              {VARIABLES.map((v) => (
                <button key={v} className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-[11px] text-slate-600 hover:bg-indigo-100"
                  onClick={() => set("body", `${cur.body}{{${v}}}`)}>{`{{${v}}}`}</button>
              ))}
            </div>
            <div className="space-y-1.5 text-sm">
              <label className="flex items-center gap-2"><input type="checkbox" checked={cur.useAI} onChange={(e) => set("useAI", e.target.checked)} /> <span>Let Claude write the {"{{aiLine}}"} opening per company (needs Claude key)</span></label>
              <label className="flex items-center gap-2"><input type="checkbox" checked={cur.autoResume} onChange={(e) => set("autoResume", e.target.checked)} /> Pick resume automatically (tech roles → tech resume, PM/consulting/analyst → non-tech)</label>
              {!cur.autoResume && (
                <div className="flex gap-4 pl-6">
                  <label className="flex items-center gap-2"><input type="checkbox" checked={cur.attachTech} onChange={(e) => set("attachTech", e.target.checked)} /> Tech resume</label>
                  <label className="flex items-center gap-2"><input type="checkbox" checked={cur.attachNonTech} onChange={(e) => set("attachNonTech", e.target.checked)} /> Non-tech resume</label>
                </div>
              )}
            </div>
            <div className="flex justify-between">
              <button className="btn-danger" disabled={!cur.id} onClick={remove}>Delete</button>
              <button className="btn-primary" onClick={save}>Save template</button>
            </div>
          </div>
        )}

        {preview && (
          <div className="card h-fit p-4">
            <div className="label">Preview (sample contact)</div>
            <div className="mt-2 border-b border-slate-100 pb-2 text-sm font-semibold">{preview.subject}</div>
            <pre className="mt-3 whitespace-pre-wrap font-sans text-sm leading-relaxed text-slate-700">{preview.body}</pre>
          </div>
        )}
      </div>
      <Toast msg={toast} onClose={() => setToast(null)} />
    </div>
  );
}
