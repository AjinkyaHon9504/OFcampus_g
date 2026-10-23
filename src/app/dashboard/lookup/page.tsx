"use client";
import { useState } from "react";
import { SendDialog, type ContactRow } from "@/components/contacts";
import { api, Badge, PageHeader, Toast, useData } from "@/components/ui";

type Focus = "HR" | "FOUNDER" | "MIXED";

interface Result {
  company: { id: string; name: string; domain: string | null; linkedinUrl: string | null; category: string };
  focus: Focus;
  contacts: ContactRow[];
  note: string;
  cached: boolean;
}

const FOCUS: [Focus, string][] = [
  ["HR", "HR / recruiters"],
  ["FOUNDER", "Founders & hiring managers"],
  ["MIXED", "Both"],
];

export default function Lookup() {
  const companies = useData<{ id: string; name: string; domain: string | null }[]>("/api/companies").data;
  const [name, setName] = useState("");
  const [domain, setDomain] = useState("");
  const [focus, setFocus] = useState<Focus>("HR");
  const [want, setWant] = useState(3);
  const [busy, setBusy] = useState(false);
  const [res, setRes] = useState<Result | null>(null);
  const [error, setError] = useState("");
  const [sendIds, setSendIds] = useState<string[]>([]);
  const [toast, setToast] = useState<string | null>(null);

  async function find(refresh = false) {
    setBusy(true);
    setError("");
    try {
      setRes(await api<Result>("/api/lookup", { method: "POST", body: { company: name, domain, focus, want, refresh } }));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  function pickCompany(v: string) {
    setName(v);
    const known = companies?.find((c) => c.name.toLowerCase() === v.toLowerCase());
    if (known?.domain && !domain) setDomain(known.domain);
  }

  async function queue(id: string) {
    await api("/api/contacts", { method: "PATCH", body: { ids: [id], status: "QUEUED" } });
    setToast("Queued for the daily run");
    find();
  }

  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader title="Find a contact" subtitle="Get HR or founder contacts with emails for any company. Companies outside your list are researched on the web first (Gemini + Google Search), then emails come from Apollo/Hunter." />

      <form className="card space-y-4 p-5" onSubmit={(e) => { e.preventDefault(); find(); }}>
        <div className="grid gap-3 md:grid-cols-[2fr_1fr]">
          <div>
            <label className="label">Company</label>
            <input className="input" list="known-companies" placeholder="e.g. Razorpay" value={name} onChange={(e) => pickCompany(e.target.value)} autoFocus />
            <datalist id="known-companies">{companies?.map((c) => <option key={c.id} value={c.name} />)}</datalist>
          </div>
          <div>
            <label className="label">Website (optional, improves accuracy)</label>
            <input className="input font-mono text-xs" placeholder="razorpay.com" value={domain} onChange={(e) => setDomain(e.target.value)} />
          </div>
        </div>
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <label className="label">Looking for</label>
            <div className="inline-flex rounded-lg border border-slate-200 p-0.5">
              {FOCUS.map(([k, label]) => (
                <button type="button" key={k} onClick={() => setFocus(k)}
                  className={`rounded-md px-3 py-1.5 text-sm font-medium ${focus === k ? "bg-indigo-600 text-white" : "text-slate-600 hover:bg-slate-50"}`}>
                  {label}
                </button>
              ))}
            </div>
          </div>
          <div className="flex items-end gap-2">
            <div>
              <label className="label">People</label>
              <select className="input w-20" value={want} onChange={(e) => setWant(Number(e.target.value))}>
                {[1, 2, 3, 4, 5].map((n) => <option key={n}>{n}</option>)}
              </select>
            </div>
            <button className="btn-primary py-2" disabled={busy || !name.trim()}>{busy ? "Searching…" : "Find contacts"}</button>
          </div>
        </div>
        {error && <p className="rounded-lg bg-rose-50 p-3 text-sm text-rose-700">{error}</p>}
      </form>

      {res && (
        <section className="mt-5">
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="flex flex-wrap items-baseline gap-2 font-semibold">
                {res.company.name}
                {res.company.domain && <span className="font-mono text-xs font-normal text-slate-500">{res.company.domain}</span>}
                {res.company.linkedinUrl && <a className="text-xs font-normal text-sky-700 hover:underline" href={res.company.linkedinUrl} target="_blank" rel="noreferrer">LinkedIn page</a>}
              </h2>
              {res.company.category && <p className="text-xs text-slate-600">{res.company.category}</p>}
              <p className="text-xs text-slate-500">{res.note}</p>
            </div>
            <div className="flex gap-2">
              {res.cached && <button className="btn-ghost" disabled={busy} onClick={() => find(true)}>Search again</button>}
              <button className="btn-primary" disabled={!res.contacts.some((c) => c.email)}
                onClick={() => setSendIds(res.contacts.filter((c) => c.email && ["NEW", "SENT", "FOLLOW_UP_DUE", "QUEUED"].includes(c.status)).map((c) => c.id))}>
                Mail all with email
              </button>
            </div>
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            {res.contacts.map((c) => (
              <div key={c.id} className="card p-4">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="font-medium">{c.name}</div>
                    <div className="text-xs text-slate-500">{c.title || "—"}</div>
                  </div>
                  <div className="flex gap-1"><Badge v={c.persona} /><Badge v={c.status} /></div>
                </div>
                <div className="mt-3 space-y-1 text-sm">
                  {c.email ? (
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-xs">{c.email}</span>
                      <Badge v={c.emailStatus} />
                      <button className="text-xs text-indigo-600 hover:underline" onClick={() => { navigator.clipboard.writeText(c.email!); setToast("Email copied"); }}>copy</button>
                    </div>
                  ) : <div className="text-xs text-slate-400">No email found</div>}
                  <div className="flex flex-wrap gap-3">
                    {c.linkedinUrl && (
                      <a className="text-xs text-sky-700 hover:underline" href={c.linkedinUrl} target="_blank" rel="noreferrer">
                        LinkedIn{c.linkedinMatch ? " ✓ cross-checked" : ""}
                      </a>
                    )}
                    {c.source === "web" && (
                      <span className="text-xs text-amber-700" title="Found by web research. Check the LinkedIn profile before mailing.">
                        found by web search{c.sourceUrl && <> · <a className="hover:underline" href={c.sourceUrl} target="_blank" rel="noreferrer">source</a></>}
                      </span>
                    )}
                  </div>
                </div>
                {c.email && c.status !== "REPLIED" && c.status !== "DO_NOT_CONTACT" && c.status !== "BOUNCED" && (
                  <div className="mt-3 flex gap-2">
                    <button className="btn-primary" onClick={() => setSendIds([c.id])}>Preview &amp; send</button>
                    {c.status !== "QUEUED" && <button className="btn-ghost" onClick={() => queue(c.id)}>Queue</button>}
                  </div>
                )}
              </div>
            ))}
            {res.contacts.length === 0 && (
              <p className="card p-6 text-sm text-slate-500 md:col-span-2">
                Nobody found. Add the company website above and try again, or switch “Looking for”.
              </p>
            )}
          </div>
        </section>
      )}

      <SendDialog ids={sendIds} open={sendIds.length > 0} onClose={() => setSendIds([])}
        onDone={(m) => { setSendIds([]); setToast(m); find(); }} />
      <Toast msg={toast} onClose={() => setToast(null)} />
    </div>
  );
}
