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
      <header className="sticky top-0 z-30 border-b border-line bg-paper/85 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-5xl items-center gap-6 px-4">
          <Link href="/" className="text-lg font-semibold tracking-tight">
            kiki<span className="text-brand">.</span>
          </Link>
          <nav className="hidden gap-1 sm:flex">
            {links.map((l) => (
              <Link
                key={l.href}
                href={l.href}
                className={`rounded-lg px-3 py-1.5 text-sm ${active(l.href) ? "bg-ink/5 font-medium" : "text-muted hover:text-ink"}`}
              >
                {l.label}
              </Link>
            ))}
          </nav>
          <div className="ml-auto flex items-center gap-3">
            <Link href="/plans/new" className="btn-primary hidden sm:inline-flex">+ New plan</Link>
            {me && (
              <form action={signOutAction} className="flex items-center gap-2">
                <Avatar name={me.name} color={me.color} />
                <button className="text-xs text-muted hover:text-ink" title="Sign out">Sign out</button>
              </form>
            )}
          </div>
        </div>
      </header>
      <nav className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-4 border-t border-line bg-card/95 backdrop-blur sm:hidden">
        {links.map((l) => (
          <Link key={l.href} href={l.href} className={`flex flex-col items-center py-2 text-[11px] ${active(l.href) ? "text-ink font-medium" : "text-muted"}`}>
            <span className="text-lg leading-none">{l.icon}</span>
            {l.label}
          </Link>
        ))}
        <Link href="/plans/new" className="flex flex-col items-center py-2 text-[11px] text-brand font-medium">
          <span className="text-lg leading-none">＋</span>
          Plan
        </Link>
      </nav>
    </>
  );
}
