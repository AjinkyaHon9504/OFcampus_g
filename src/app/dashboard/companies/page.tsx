"use client";
import { useMemo, useRef, useState } from "react";
import { api, Badge, PageHeader, Toast, timeAgo, useData } from "@/components/ui";

interface CompanyRow {
  id: string;
  name: string;
  category: string;
  type: string;
  stage: string;
  roles: string;
  fitFor: string;
  route: string;
  track: string;
  teamSize: number | null;
  domain: string | null;
  priority: number;
  status: string;
  hiringSignal: string;
  enrichedAt: string | null;
  enrichNote: string | null;
  contactCount: number;
  emailCount: number;
  replied: boolean;
}

export default function Companies() {
  const { data, reload } = useData<CompanyRow[]>("/api/companies");
  const [q, setQ] = useState("");
  const [route, setRoute] = useState("");
  const [fit, setFit] = useState("");
  const [pending, setPending] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [progress, setProgress] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const stop = useRef(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const rows = useMemo(() => {
    const n = q.toLowerCase();
    return (data ?? []).filter(
      (c) => (!n || `${c.name} ${c.category} ${c.domain ?? ""}`.toLowerCase().includes(n)) && (!route || c.route === route) &&
        (!fit || c.fitFor === fit || c.fitFor === "Both") && (!pending || !c.enrichedAt),
    );
  }, [data, q, route, fit, pending]);
  const fits = useMemo(() => [...new Set((data ?? []).map((c) => c.fitFor).filter((f) => f && f !== "Both"))], [data]);

  async function importFile(file: File) {
    const form = new FormData();
    form.append("file", file);
    setProgress("Importing…");
    try {
      const r = await api<{ companies: number; people: number }>("/api/import", { method: "POST", body: form });
      setToast(`Imported ${r.companies} companies and ${r.people} people named in the sheet`);
      reload();
    } catch (e) {
      setToast((e as Error).message);
    } finally {
      setProgress(null);
    }
  }

  // Enrich in small batches so each request stays inside the serverless time limit.
  async function enrich(ids?: string[], max = 25, routeOverride?: "HR") {
    stop.current = false;
    let done = 0;
    let found = 0;
    const queue = ids ? [...ids] : null;
    try {
      while (!stop.current && done < (queue?.length ?? max)) {
        const batch = queue ? queue.slice(done, done + 3) : undefined;
        setProgress(`Finding contacts… ${done}/${queue?.length ?? max}`);
        const r = await api<{ results: { company: string; withEmail: number; note: string }[]; remaining: number }>("/api/enrich", {
          method: "POST",
          body: { companyIds: batch, batch: 3, fitFor: fit || undefined, force: !!queue, route: routeOverride },
        });
        if (!r.results.length) break;
        done += r.results.length;
        found += r.results.reduce((s, x) => s + x.withEmail, 0);
        const keyErr = r.results.find((x) => /API key|401|403/.test(x.note));
        if (keyErr) throw new Error(keyErr.note);
      }
      setToast(`Enriched ${done} companies — ${found} emails found`);
    } catch (e) {
      setToast((e as Error).message);
    } finally {
      setProgress(null);
      setSelected(new Set());
      reload();
    }
  }

  async function saveDomain(c: CompanyRow, domain: string) {
    if ((c.domain ?? "") === domain) return;
    await api("/api/companies", { method: "PATCH", body: { id: c.id, domain } });
    reload();
  }

  const ids = [...selected];
  const toggle = (id: string) => setSelected((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const notEnriched = (data ?? []).filter((c) => !c.enrichedAt).length;

  return (
    <div className="mx-auto max-w-7xl">
      <PageHeader title="Companies" subtitle={`${data?.length ?? 0} companies · ${notEnriched} not enriched yet`}>
        <input ref={fileRef} type="file" accept=".csv" className="hidden" onChange={(e) => e.target.files?.[0] && importFile(e.target.files[0])} />
        <button className="btn-ghost" onClick={() => fileRef.current?.click()}>Import CSV</button>
        <a className="btn-ghost" href="/api/export?type=companies">Download CSV</a>
        {progress ? (
          <button className="btn-danger" onClick={() => (stop.current = true)}>{progress} · Stop</button>
        ) : ids.length ? (
          <>
            <button className="btn-ghost" onClick={() => enrich(ids, ids.length, "HR")}>Find HR for {ids.length}</button>
            <button className="btn-primary" onClick={() => enrich(ids)}>Find contacts for {ids.length}</button>
          </>
        ) : (
          <button className="btn-primary" disabled={!notEnriched} onClick={() => enrich(undefined, 25)}>Find contacts (next 25 by priority)</button>
        )}
      </PageHeader>

      <div className="mb-3 flex flex-wrap gap-2">
        <input className="input max-w-xs" placeholder="Search…" value={q} onChange={(e) => setQ(e.target.value)} />
        <select className="input w-auto" value={route} onChange={(e) => setRoute(e.target.value)}>
          <option value="">All routes</option>
          <option value="FOUNDER">Founder route (≤50 people / YC / early)</option>
          <option value="MIXED">Mixed</option>
          <option value="HR">HR route (unicorn / MNC / listed)</option>
        </select>
        <select className="input w-auto" value={fit} onChange={(e) => setFit(e.target.value)}>
          <option value="">Fit: everyone</option>
          {fits.map((f) => <option key={f}>{f}</option>)}
        </select>
        <label className="flex items-center gap-1.5 text-sm text-slate-600">
          <input type="checkbox" checked={pending} onChange={(e) => setPending(e.target.checked)} /> not enriched
        </label>
      </div>

      <div className="card overflow-x-auto">
        <table className="min-w-full divide-y divide-slate-100">
          <thead className="bg-slate-50/60">
            <tr>
              <th className="th w-8"><input type="checkbox" checked={rows.length > 0 && rows.every((r) => selected.has(r.id))} onChange={() => setSelected(rows.every((r) => selected.has(r.id)) ? new Set() : new Set(rows.map((r) => r.id)))} /></th>
              <th className="th">P</th>
              <th className="th">Company</th>
              <th className="th">Route</th>
              <th className="th">Domain</th>
              <th className="th">Contacts</th>
              <th className="th">Enrichment</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.map((c) => (
              <tr key={c.id} className={selected.has(c.id) ? "bg-indigo-50/40" : "hover:bg-slate-50/60"}>
                <td className="td"><input type="checkbox" checked={selected.has(c.id)} onChange={() => toggle(c.id)} /></td>
                <td className="td tabular-nums text-slate-500">{c.priority}</td>
                <td className="td max-w-xs">
                  <div className="font-medium">{c.name} {c.replied && <Badge v="REPLIED" label="replied" />}</div>
                  <div className="mt-0.5 text-xs text-slate-500">{c.category} · {c.type}{c.teamSize ? ` · ${c.teamSize} people` : ""}</div>
                  <div className="mt-0.5 line-clamp-1 text-xs text-slate-400" title={c.hiringSignal}>{c.roles} · {c.hiringSignal}</div>
                </td>
                <td className="td"><div className="flex flex-col gap-1"><Badge v={c.route} /><Badge v={c.track} /></div></td>
                <td className="td">
                  <input className="input w-40 font-mono text-xs" defaultValue={c.domain ?? ""} placeholder="add domain"
                    onBlur={(e) => saveDomain(c, e.target.value.trim())} />
                </td>
                <td className="td whitespace-nowrap text-sm">{c.emailCount}/{c.contactCount} <span className="text-xs text-slate-400">with email</span></td>
                <td className="td max-w-[220px] text-xs text-slate-500">
                  {c.enrichedAt ? <><div>{timeAgo(c.enrichedAt)}</div><div className="line-clamp-2">{c.enrichNote}</div></> : "—"}
                </td>
              </tr>
            ))}
            {rows.length === 0 && <tr><td className="td py-10 text-center text-slate-500" colSpan={7}>{data?.length ? "No matches." : "Import your company CSV to begin."}</td></tr>}
          </tbody>
        </table>
      </div>
      <Toast msg={toast} onClose={() => setToast(null)} />
    </div>
  );
}
