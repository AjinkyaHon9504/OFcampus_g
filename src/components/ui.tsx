"use client";
import { useCallback, useEffect, useState } from "react";

export async function api<T = unknown>(url: string, init?: Omit<RequestInit, "body"> & { body?: unknown }): Promise<T> {
  const isForm = init?.body instanceof FormData;
  const res = await fetch(url, {
    ...init,
    headers: isForm ? undefined : { "Content-Type": "application/json" },
    body: isForm ? (init!.body as FormData) : init?.body !== undefined ? JSON.stringify(init.body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((data as { error?: string }).error ?? `Request failed (${res.status})`);
  return data as T;
}

export function useData<T>(url: string) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const reload = useCallback(() => {
    api<T>(url).then(setData).catch((e: Error) => setError(e.message));
  }, [url]);
  useEffect(reload, [reload]);
  return { data, error, reload, setData };
}

const TONES: Record<string, string> = {
  NEW: "bg-slate-100 text-slate-700",
  QUEUED: "bg-amber-100 text-amber-800",
  SENT: "bg-sky-100 text-sky-800",
  FOLLOW_UP_DUE: "bg-orange-100 text-orange-800",
  REPLIED: "bg-emerald-100 text-emerald-800",
  BOUNCED: "bg-rose-100 text-rose-700",
  DO_NOT_CONTACT: "bg-slate-200 text-slate-500",
  FOUNDER: "bg-violet-100 text-violet-800",
  HR: "bg-teal-100 text-teal-800",
  HIRING_MANAGER: "bg-indigo-100 text-indigo-800",
  MIXED: "bg-fuchsia-100 text-fuchsia-800",
  verified: "bg-emerald-100 text-emerald-800",
  likely: "bg-lime-100 text-lime-800",
  unverified: "bg-amber-100 text-amber-800",
  none: "bg-slate-100 text-slate-500",
  TECH: "bg-sky-50 text-sky-700",
  NONTECH: "bg-pink-50 text-pink-700",
};

export function Badge({ v, label }: { v: string; label?: string }) {
  return (
    <span className={`inline-flex whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-medium ${TONES[v] ?? "bg-slate-100 text-slate-600"}`}>
      {label ?? v.replace(/_/g, " ").toLowerCase()}
    </span>
  );
}

export function Stat({ label, value, hint }: { label: string; value: string | number; hint?: string }) {
  return (
    <div className="card p-4">
      <div className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</div>
      <div className="mt-1 text-2xl font-semibold tabular-nums">{value}</div>
      {hint && <div className="mt-0.5 text-xs text-slate-500">{hint}</div>}
    </div>
  );
}

export function PageHeader({ title, subtitle, children }: { title: string; subtitle?: string; children?: React.ReactNode }) {
  return (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-xl font-semibold">{title}</h1>
        {subtitle && <p className="mt-0.5 text-sm text-slate-500">{subtitle}</p>}
      </div>
      <div className="flex flex-wrap gap-2">{children}</div>
    </div>
  );
}

export function Toast({ msg, onClose }: { msg: string | null; onClose: () => void }) {
  useEffect(() => {
    if (!msg) return;
    const t = setTimeout(onClose, 6000);
    return () => clearTimeout(t);
  }, [msg, onClose]);
  if (!msg) return null;
  return (
    <div className="fixed bottom-4 right-4 z-50 max-w-md rounded-lg bg-slate-900 px-4 py-3 text-sm text-white shadow-lg" onClick={onClose}>
      {msg}
    </div>
  );
}

export function Modal({ open, onClose, title, children, wide }: { open: boolean; onClose: () => void; title: string; children: React.ReactNode; wide?: boolean }) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-40 flex items-start justify-center overflow-y-auto bg-slate-900/40 p-4" onClick={onClose}>
      <div className={`card mt-10 w-full ${wide ? "max-w-4xl" : "max-w-lg"} p-5`} onClick={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold">{title}</h2>
          <button className="text-slate-400 hover:text-slate-700" onClick={onClose} aria-label="Close">✕</button>
        </div>
        {children}
      </div>
    </div>
  );
}

export function timeAgo(d: string | Date | null | undefined): string {
  if (!d) return "—";
  const s = (Date.now() - new Date(d).getTime()) / 1000;
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}
