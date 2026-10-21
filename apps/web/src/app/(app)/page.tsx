"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { orpc } from "@/lib/orpc";
import { dayLabel, money } from "@/lib/format";
import { PlanCard, groupByDay } from "@/components/plan-card";

export default function HomePage() {
  const range = useMemo(() => {
    const from = new Date();
    from.setHours(0, 0, 0, 0);
    const to = new Date(from);
    to.setDate(to.getDate() + 14);
    return { from, to };
  }, []);
  const me = useQuery(orpc.me.get.queryOptions());
  const plans = useQuery(orpc.plans.occurrences.queryOptions({ input: { ...range, onlyMine: true } }));
  const crews = useQuery(orpc.crews.list.queryOptions());
  const money_ = useQuery(orpc.expenses.mySummary.queryOptions());

  const upcoming = (plans.data ?? []).filter((o) => o.end.getTime() > Date.now());
  const needsAnswer = upcoming.filter((o) => o.myStatus === null);
  const days = groupByDay(upcoming);

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-8 lg:grid-cols-[1fr_300px]">
      <section>
        <h1 className="text-3xl font-bold tracking-tight">
          Hey{me.data ? `, ${me.data.name}` : ""} 👋
        </h1>
        <p className="mt-1 text-muted">
          {plans.isLoading
            ? "Loading your next two weeks…"
            : needsAnswer.length
              ? `${needsAnswer.length} plan${needsAnswer.length > 1 ? "s" : ""} waiting on your answer.`
              : upcoming.length
                ? "You're all caught up."
                : "Nothing on the books for the next two weeks."}
        </p>

        <div className="mt-6 space-y-6">
          {days.map((items) => (
            <div key={items[0]!.start.toDateString()}>
              <h2 className="mb-2 text-sm font-semibold text-muted">{dayLabel(items[0]!.start)}</h2>
              <div className="space-y-2">
                {items.map((o) => (
                  <PlanCard key={`${o.planId}-${o.start.getTime()}`} o={o} />
                ))}
              </div>
            </div>
          ))}
          {!plans.isLoading && !upcoming.length && (
            <div className="card flex flex-col items-start gap-3 p-6">
              <p className="font-medium">Get something going.</p>
              <p className="text-sm text-muted">
                Start a crew for the people you actually see, then throw out a plan. It doesn&apos;t have to be a party.
              </p>
              <div className="flex gap-2">
                <Link href="/plans/new" className="btn-primary">+ New plan</Link>
                <Link href="/crews/new" className="btn-ghost">Start a crew</Link>
              </div>
            </div>
          )}
        </div>
      </section>

      <aside className="space-y-6">
        <div className="card p-4">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="font-semibold">Your crews</h2>
            <Link href="/crews/new" className="text-sm font-semibold text-brand">+ New</Link>
          </div>
          <ul className="space-y-1">
            {crews.data?.map((c) => (
              <li key={c.id}>
                <Link href={`/crews/${c.id}`} className="-mx-2 flex items-center gap-2 rounded-xl px-2 py-1.5 transition hover:bg-brand-soft">
                  <span className="text-lg">{c.emoji}</span>
                  <span className="flex-1 truncate text-sm font-medium">{c.name}</span>
                  <span className="text-xs text-muted">{c.memberCount}</span>
                </Link>
              </li>
            ))}
            {crews.data?.length === 0 && <li className="text-sm text-muted">No crews yet.</li>}
          </ul>
        </div>

        <div className="card p-4">
          <h2 className="mb-3 font-semibold">Money</h2>
          {money_.data?.length ? (
            <ul className="space-y-2">
              {money_.data.map((m) => (
                <li key={m.crewId}>
                  <Link href={`/crews/${m.crewId}?tab=money`} className="flex items-center justify-between text-sm">
                    <span className="truncate">{m.crewEmoji} {m.crewName}</span>
                    <span className={`font-medium ${m.netCents > 0 ? "text-go" : "text-nope"}`}>
                      {m.netCents > 0 ? `you're owed ${money(m.netCents)}` : `you owe ${money(-m.netCents)}`}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted">All square. ✨</p>
          )}
        </div>

        <Link href="/availability" className="card block bg-gradient-to-br from-violet-soft to-brand-soft p-4 transition hover:-translate-y-0.5 hover:border-brand/25">
          <h2 className="font-semibold">🗓️ Keep your week up to date</h2>
          <p className="mt-1 text-sm text-muted">Paint when you&apos;re usually busy so friends can pick times that work.</p>
        </Link>
      </aside>
    </div>
  );
}
