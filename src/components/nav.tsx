"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut } from "next-auth/react";

const LINKS = [
  ["/dashboard", "Overview"],
  ["/dashboard/today", "Today"],
  ["/dashboard/lookup", "Find contact"],
  ["/dashboard/contacts", "Contacts"],
  ["/dashboard/companies", "Companies"],
  ["/dashboard/templates", "Templates"],
  ["/dashboard/settings", "Settings"],
] as const;

export function Nav({ email }: { email: string }) {
  const path = usePathname();
  return (
    <aside className="border-b border-slate-200 bg-white md:sticky md:top-0 md:h-screen md:w-56 md:shrink-0 md:border-b-0 md:border-r">
      <div className="flex items-center gap-2 px-4 py-4">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-600 font-bold text-white">O</div>
        <span className="font-semibold">Outreach</span>
      </div>
      <nav className="flex gap-1 overflow-x-auto px-2 pb-2 md:flex-col md:pb-0">
        {LINKS.map(([href, label]) => {
          const active = href === "/dashboard" ? path === href : path.startsWith(href);
          return (
            <Link
              key={href}
              href={href}
              className={`whitespace-nowrap rounded-lg px-3 py-2 text-sm font-medium ${active ? "bg-indigo-50 text-indigo-700" : "text-slate-600 hover:bg-slate-50"}`}
            >
              {label}
            </Link>
          );
        })}
      </nav>
      <div className="hidden px-4 py-4 md:absolute md:bottom-0 md:block md:w-56">
        <div className="truncate text-xs text-slate-500">{email}</div>
        <button className="mt-1 text-xs font-medium text-slate-600 hover:text-slate-900" onClick={() => signOut({ callbackUrl: "/" })}>
          Sign out
        </button>
      </div>
    </aside>
  );
}
