"use client";

import Link from "next/link";
import { AddToCalendar } from "./add-to-calendar";
import { AvatarStack } from "./avatar";
import { RsvpButtons } from "./rsvp-buttons";
import { kindEmoji, timeRange } from "@/lib/format";
import type { RsvpStatus } from "@lowkey/validators";

export interface OccurrenceView {
  planId: string;
  crewName: string;
  crewEmoji: string;
  title: string;
  kind: string;
  location: string | null;
  repeatsWeekly: boolean;
  capacity: number | null;
  start: Date;
  end: Date;
  invited: boolean;
  myStatus: RsvpStatus | null;
  counts: { going: number; maybe: number; declined: number; pending: number };
  going: { userId: string; name: string; color: string }[];
}

export function PlanCard({ o, showCrew = true }: { o: OccurrenceView; showCrew?: boolean }) {
  const past = o.end.getTime() < Date.now();
  return (
    <div
      className={`card flex flex-col gap-3 p-4 transition hover:-translate-y-0.5 hover:border-brand/25 hover:shadow-[0_10px_28px_-10px_rgb(224_64_154/0.35)] sm:flex-row sm:items-center ${past ? "opacity-60" : ""}`}
    >
      <Link href={`/plans/${o.planId}`} className="flex min-w-0 flex-1 items-start gap-3">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-brand-soft to-violet-soft text-xl">{kindEmoji[o.kind] ?? "✨"}</div>
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
            <h3 className="truncate font-semibold">{o.title}</h3>
            {o.repeatsWeekly && <span className="chip bg-violet-soft text-violet">weekly</span>}
          </div>
          <p className="text-sm text-muted">
            {timeRange(o.start, o.end)}
            {o.location ? ` · ${o.location}` : ""}
          </p>
          <div className="mt-1.5 flex items-center gap-2 text-xs text-muted">
            {o.going.length > 0 && <AvatarStack people={o.going} size={20} />}
            <span className="whitespace-nowrap">
              {o.counts.going} in{o.capacity ? ` / ${o.capacity}` : ""}
              {o.counts.maybe ? ` · ${o.counts.maybe} maybe` : ""}
            </span>
            {showCrew && <span className="truncate">· {o.crewEmoji} {o.crewName}</span>}
          </div>
        </div>
      </Link>
      {!past && (
        <div className="flex items-center gap-2 sm:shrink-0">
          <RsvpButtons planId={o.planId} occurrenceStart={o.start} status={o.myStatus} repeatsWeekly={o.repeatsWeekly} compact />
          <AddToCalendar compact event={{ id: o.planId, title: o.title, location: o.location, start: o.start, end: o.end }} />
        </div>
      )}
    </div>
  );
}

/** Group occurrences under day headings. */
export function groupByDay<T extends { start: Date }>(items: T[]) {
  const groups = new Map<string, T[]>();
  for (const i of items) {
    const k = i.start.toDateString();
    groups.set(k, [...(groups.get(k) ?? []), i]);
  }
  return [...groups.values()];
}
