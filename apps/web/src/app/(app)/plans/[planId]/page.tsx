"use client";

import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useParams } from "next/navigation";
import { useState } from "react";
import { orpc } from "@/lib/orpc";
import { dayLabel, kindEmoji, money, timeRange } from "@/lib/format";
import { downloadIcs } from "@/lib/ics";
import { Avatar } from "@/components/avatar";
import { RsvpButtons } from "@/components/rsvp-buttons";
import { ExpenseForm } from "@/components/money";

const STATUS_STYLE = {
  going: { label: "in", cls: "bg-go-soft text-go" },
  maybe: { label: "maybe", cls: "bg-maybe-soft text-maybe" },
  declined: { label: "can't", cls: "bg-nope-soft text-nope" },
} as const;

export default function PlanPage() {
  const { planId } = useParams<{ planId: string }>();
  const qc = useQueryClient();
  const plan = useQuery(orpc.plans.get.queryOptions({ input: { planId } }));
  const me = useQuery(orpc.me.get.queryOptions());
  const [occIndex, setOccIndex] = useState(0);
  const [splitting, setSplitting] = useState(false);
  const cancel = useMutation(orpc.plans.cancel.mutationOptions({ onSuccess: () => qc.invalidateQueries({ queryKey: orpc.plans.key() }) }));
  const crew = useQuery(orpc.crews.get.queryOptions({ input: { crewId: plan.data?.crewId ?? "" }, enabled: !!plan.data }));

  if (plan.error) return <p className="card p-6 text-muted">Couldn&apos;t find that plan.</p>;
  if (!plan.data || !me.data) return <p className="text-muted">Loading…</p>;
  const p = plan.data;
  const meId = me.data.id;
  const occ = p.occurrences[Math.min(occIndex, p.occurrences.length - 1)]!;
  const statusOf = (userId: string) => occ.responses.find((r) => r.userId === userId)?.status ?? null;
  const myStatus = statusOf(me.data.id);
  const goingIds = p.invitees.filter((i) => statusOf(i.userId) === "going").map((i) => i.userId);
  const order = { going: 0, maybe: 1, declined: 3 } as const;
  const sortedInvitees = [...p.invitees].sort((a, b) => {
    const sa = statusOf(a.userId);
    const sb = statusOf(b.userId);
    return (sa ? order[sa] : 2) - (sb ? order[sb] : 2);
  });
  const past = occ.end.getTime() < Date.now();

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-6 lg:grid-cols-[1fr_320px]">
      <div className="space-y-5">
        <div>
          <Link href={`/crews/${p.crewId}`} className="text-sm text-muted hover:text-ink">
            {p.crew.emoji} {p.crew.name}
          </Link>
          <h1 className="mt-1 flex items-center gap-2 text-3xl font-semibold tracking-tight">
            <span>{kindEmoji[p.kind]}</span> {p.title}
          </h1>
          {p.cancelledAt && <p className="mt-2 chip bg-nope-soft text-nope">Cancelled</p>}
          <p className="mt-2 text-muted">
            {p.repeatsWeekly ? "Every " + p.startsAt.toLocaleDateString("en-US", { weekday: "long" }) : dayLabel(occ.start)},{" "}
            {timeRange(occ.start, occ.end)}
            {p.location && <> · 📍 {p.location}</>}
          </p>
          {p.description && <p className="mt-3 whitespace-pre-wrap">{p.description}</p>}
          <p className="mt-3 text-xs text-muted">Organized by {p.createdBy.id === me.data.id ? "you" : p.createdBy.name}</p>
        </div>

        {p.repeatsWeekly && p.occurrences.length > 1 && (
          <div className="flex gap-1.5 overflow-x-auto pb-1">
            {p.occurrences.map((o, i) => (
              <button
                key={o.start.toISOString()}
                onClick={() => setOccIndex(i)}
                className={`shrink-0 rounded-xl border px-3 py-2 text-left text-sm ${i === occIndex ? "border-ink bg-card" : "border-line bg-card/50 text-muted"}`}
              >
                <div className="font-medium">{o.start.toLocaleDateString("en-US", { month: "short", day: "numeric" })}</div>
                <div className="text-xs">{o.counts.going} in</div>
              </button>
            ))}
          </div>
        )}

        {!p.cancelledAt && !past && (
          <div className="card p-4">
            <div className="mb-2 font-medium">
              {p.repeatsWeekly ? `You in on ${occ.start.toLocaleDateString("en-US", { month: "short", day: "numeric" })}?` : "You in?"}
            </div>
            <RsvpButtons planId={p.id} occurrenceStart={occ.start} status={myStatus} repeatsWeekly={p.repeatsWeekly} />
          </div>
        )}

        <div className="card p-4">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="font-semibold">
              {occ.counts.going} going{p.capacity ? ` · ${Math.max(0, p.capacity - occ.counts.going)} spots left` : ""}
            </h2>
            <span className="text-xs text-muted">
              {occ.counts.maybe} maybe · {occ.counts.pending} haven&apos;t said
            </span>
          </div>
          <ul className="grid gap-2 sm:grid-cols-2">
            {sortedInvitees.map((i) => {
              const s = statusOf(i.userId);
              return (
                <li key={i.userId} className="flex items-center gap-2">
                  <Avatar name={i.name} color={i.color} size={26} />
                  <span className="flex-1 text-sm">{i.userId === meId ? "You" : i.name}</span>
                  {s ? <span className={`chip ${STATUS_STYLE[s].cls}`}>{STATUS_STYLE[s].label}</span> : <span className="chip bg-paper text-muted">…</span>}
                  {p.repeatsWeekly && i.standingStatus === "going" && <span title="In every week">🔁</span>}
                </li>
              );
            })}
          </ul>
        </div>
      </div>

      <aside className="space-y-4">
        <div className="card space-y-2 p-4">
          <button
            className="btn-ghost w-full"
            onClick={() =>
              downloadIcs({
                id: p.id,
                title: p.title,
                description: p.description,
                location: p.location,
                start: p.repeatsWeekly ? p.startsAt : occ.start,
                end: p.repeatsWeekly ? p.endsAt : occ.end,
                weekly: p.repeatsWeekly,
                until: p.repeatUntil,
              })
            }
          >
            📅 Add to my calendar
          </button>
          {p.isOrganizer && !p.cancelledAt && (
            <button
              className="w-full text-sm text-muted hover:text-nope"
              onClick={() => confirm(p.repeatsWeekly ? "Cancel every week of this plan?" : "Cancel this plan?") && cancel.mutate({ planId: p.id })}
            >
              Cancel plan
            </button>
          )}
        </div>

        <div className="card p-4">
          <div className="mb-2 flex items-center justify-between">
            <h2 className="font-semibold">💸 Costs</h2>
            {!splitting && <button className="text-sm text-brand" onClick={() => setSplitting(true)}>+ Split a cost</button>}
          </div>
          {splitting && crew.data && (
            <div className="mb-4">
              <ExpenseForm
                crewId={p.crewId}
                planId={p.id}
                members={crew.data.members}
                meId={me.data.id}
                defaultSplitIds={goingIds.length > 1 ? goingIds : undefined}
                onDone={() => setSplitting(false)}
              />
              <button className="mt-2 text-xs text-muted" onClick={() => setSplitting(false)}>cancel</button>
            </div>
          )}
          {p.expenses.length ? (
            <ul className="space-y-1.5 text-sm">
              {p.expenses.map((e) => (
                <li key={e.id} className="flex justify-between gap-2">
                  <span className="truncate">{e.description} <span className="text-muted">· {e.paidBy.name}</span></span>
                  <span>{money(e.amountCents)}</span>
                </li>
              ))}
            </ul>
          ) : (
            !splitting && <p className="text-sm text-muted">Dinner, tickets, court fees: split it here and it shows up in the crew&apos;s balances.</p>
          )}
          {p.expenses.length > 0 && (
            <Link href={`/crews/${p.crewId}?tab=money`} className="mt-3 block text-sm text-brand">See who owes who →</Link>
          )}
        </div>
      </aside>
    </div>
  );
}
