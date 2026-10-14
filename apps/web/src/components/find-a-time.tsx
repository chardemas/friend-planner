"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { orpc } from "@/lib/orpc";
import { dayLabel, timeRange, toLocalInput } from "@/lib/format";

/** "When can we all do it?" Ranks windows by how many people can make it. */
export function FindATime({ crewId }: { crewId: string }) {
  const [duration, setDuration] = useState(120);
  const [when, setWhen] = useState<"evenings" | "anytime">("evenings");
  const [range, setRange] = useState<"week" | "two">("week");
  const input = useMemo(() => {
    const from = new Date();
    const to = new Date(from);
    to.setDate(to.getDate() + (range === "week" ? 7 : 14));
    return {
      crewId,
      from,
      to,
      durationMinutes: duration,
      earliestHour: when === "evenings" ? 17 : 9,
      latestHour: 23,
      limit: 5,
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [crewId, duration, when, range]);
  const q = useQuery(orpc.availability.suggest.queryOptions({ input }));

  return (
    <div className="card p-4">
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="mr-auto font-semibold">✨ Find a time</h3>
        <select className="input w-auto py-1.5" value={duration} onChange={(e) => setDuration(Number(e.target.value))}>
          <option value={60}>1 hour</option>
          <option value={90}>1.5 hours</option>
          <option value={120}>2 hours</option>
          <option value={180}>3 hours</option>
          <option value={240}>4 hours</option>
        </select>
        <select className="input w-auto py-1.5" value={when} onChange={(e) => setWhen(e.target.value as typeof when)}>
          <option value="evenings">evenings</option>
          <option value="anytime">anytime 9am+</option>
        </select>
        <select className="input w-auto py-1.5" value={range} onChange={(e) => setRange(e.target.value as typeof range)}>
          <option value="week">next 7 days</option>
          <option value="two">next 2 weeks</option>
        </select>
      </div>
      <ul className="mt-3 divide-y divide-line">
        {q.data?.suggestions.map((s) => {
          const all = s.availableUserIds.length === q.data.memberCount;
          return (
            <li key={s.start.toISOString()} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2.5">
              <div className="min-w-[150px]">
                <div className="font-medium">{dayLabel(s.start)}</div>
                <div className="text-sm text-muted">{timeRange(s.start, s.end)}</div>
              </div>
              <div className="flex-1 text-sm">
                <span className={`chip ${all ? "bg-go text-white" : "bg-go-soft text-go"}`}>
                  {all ? "everyone" : `${s.availableUserIds.length}/${q.data.memberCount}`}
                </span>
                {s.preferredUserIds.length > 0 && (
                  <span className="ml-1.5 text-xs text-muted">{s.preferredUserIds.length} marked it free</span>
                )}
                {s.unavailable.length > 0 && (
                  <span className="ml-1.5 text-xs text-muted">· not {s.unavailable.map((u) => u.name).join(", ")}</span>
                )}
              </div>
              <Link
                className="btn-ghost py-1.5"
                href={`/plans/new?crew=${crewId}&start=${encodeURIComponent(toLocalInput(s.start))}&mins=${duration}`}
              >
                Use this
              </Link>
            </li>
          );
        })}
      </ul>
      {q.data && q.data.suggestions.length === 0 && <p className="mt-3 text-sm text-muted">No windows fit. Try a shorter plan or a wider range.</p>}
      {q.isLoading && <p className="mt-3 text-sm text-muted">Comparing calendars…</p>}
    </div>
  );
}
