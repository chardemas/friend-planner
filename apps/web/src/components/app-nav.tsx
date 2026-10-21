"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { orpc } from "@/lib/orpc";
import { signOutAction } from "@/app/actions";
import { Avatar } from "./avatar";

const links = [
  { href: "/", label: "Home", icon: "🏠" },
  { href: "/crews", label: "Crews", icon: "👯" },
  { href: "/availability", label: "My week", icon: "🗓️" },
];

export function AppNav() {
  const path = usePathname();
  const { data: me } = useQuery(orpc.me.get.queryOptions());
  const active = (href: string) => (href === "/" ? path === "/" : path.startsWith(href));
  return (
    <>
      <header className="sticky top-0 z-30 border-b border-line/70 bg-paper/70 backdrop-blur-xl">
        <div className="mx-auto flex h-14 max-w-5xl items-center gap-6 px-4">
          <Link href="/" className="font-display text-2xl font-bold tracking-tight">
            <span className="text-gradient">kiki</span><span className="ml-0.5 text-base">✨</span>
          </Link>
          <nav className="hidden gap-1 sm:flex">
            {links.map((l) => (
              <Link
                key={l.href}
                href={l.href}
                className={`rounded-full px-3.5 py-1.5 text-sm font-semibold transition ${active(l.href) ? "bg-brand-soft text-brand" : "text-muted hover:bg-white/70 hover:text-ink"}`}
              >
                {l.label}
              </Link>
            ))}
          </nav>
          <div className="ml-auto flex items-center gap-3">
            <Link href="/plans/new" className="btn-primary hidden sm:inline-flex">+ New plan</Link>
            {me && (
              <form action={signOutAction} className="flex items-center gap-2">
                <Link href="/account" title="Account">
                  <Avatar name={me.name} color={me.color} size={32} />
                </Link>
                <button className="text-xs text-muted hover:text-ink" title="Sign out">Sign out</button>
              </form>
            )}
          </div>
        </div>
      </header>
      <nav className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-4 border-t border-line/70 bg-card/85 px-2 pb-[env(safe-area-inset-bottom)] backdrop-blur-xl sm:hidden">
        {links.map((l) => (
          <Link key={l.href} href={l.href} className={`flex flex-col items-center gap-0.5 py-2 text-[11px] font-semibold ${active(l.href) ? "text-brand" : "text-muted"}`}>
            <span className={`rounded-full px-3 py-0.5 text-lg leading-none transition ${active(l.href) ? "bg-brand-soft" : ""}`}>{l.icon}</span>
            {l.label}
          </Link>
        ))}
        <Link href="/plans/new" className="flex flex-col items-center gap-0.5 py-2 text-[11px] font-semibold text-brand">
          <span className="flex h-[22px] w-10 items-center justify-center rounded-full bg-gradient-to-r from-brand to-violet text-base leading-none text-white shadow-(--shadow-glow)">＋</span>
          Plan
        </Link>
      </nav>
    </>
  );
}
