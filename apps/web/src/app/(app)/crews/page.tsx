"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { orpc } from "@/lib/orpc";

export default function CrewsPage() {
  const crews = useQuery(orpc.crews.list.queryOptions());
  return (
    <div className="max-w-2xl">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-semibold tracking-tight">Crews</h1>
        <Link href="/crews/new" className="btn-primary">+ Start a crew</Link>
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        {crews.data?.map((c) => (
          <Link key={c.id} href={`/crews/${c.id}`} className="card flex items-center gap-3 p-4 hover:border-ink/20">
            <span className="text-3xl">{c.emoji}</span>
            <div>
              <div className="font-semibold">{c.name}</div>
              <div className="text-sm text-muted">{c.memberCount} {c.memberCount === 1 ? "person" : "people"}</div>
            </div>
          </Link>
        ))}
      </div>
      {crews.data?.length === 0 && (
        <p className="card p-6 text-muted">
          A crew is just a group you make plans with: your volleyball people, the dinner club, roommates. Start one and share the invite link.
        </p>
      )}
    </div>
  );
}
