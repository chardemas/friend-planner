"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { orpc } from "@/lib/orpc";
import { minuteLabel, timeRange, toLocalInput } from "@/lib/format";
import {
  DAY_NAMES,
  SLOT,
  WeekPainter,
  cellsToRuns,
  useWeeklyPattern,
  type OneOffBlock,
  type WeeklyBlock,
  type WeeklyPattern,
} from "@/components/week-painter";

export default function AvailabilityPage() {
  const q = useQuery(orpc.availability.mine.queryOptions());
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">My week</h1>
        <p className="mt-1 max-w-2xl text-muted">
          Add when you&apos;re <b className="text-nope">busy</b> (work, class, trips) and when you&apos;re <b className="text-go">free</b>. Plans
          you say yes to block off time automatically. Friends see &quot;busy,&quot; never why.
        </p>
      </div>
      {q.data ? (
        <Availability weekly={q.data.weekly} oneOff={q.data.oneOff} timezone={q.data.timezone} />
      ) : (
        <div className="card h-96 animate-pulse" />
      )}
    </div>
  );
}

function Availability({ weekly, oneOff, timezone }: { weekly: WeeklyBlock[]; oneOff: OneOffBlock[]; timezone: string }) {
  const pattern = useWeeklyPattern(weekly);
  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-6 lg:grid-cols-[1fr_340px]">
      <div className="min-w-0 space-y-2">
        <WeekPainter pattern={pattern} oneOff={oneOff} />
        {pattern.error && <p className="text-sm text-nope">{pattern.error.message}</p>}
      </div>
      <div className="space-y-4">
        <AddBlockForm pattern={pattern} />
        <WeeklyList pattern={pattern} />
        <div className="card p-4">
          <h2 className="mb-2 font-semibold">Specific dates</h2>
          {oneOff.length ? (
            <ul className="space-y-2">
              {oneOff.map((b) => (
                <OneOffRow key={b.id} b={b} />
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted">Nothing coming up. Add trips, deadlines, or a random free afternoon.</p>
          )}
        </div>
        <p className="text-xs text-muted">Times are in {timezone.replace("_", " ")}.</p>
      </div>
    </div>
  );
}

/** "Mon–Fri", "Tue, Thu", or "Every day". */
function daysLabel(days: number[]) {
  if (days.length === 7) return "Every day";
  const order = [1, 2, 3, 4, 5, 6, 0].filter((d) => days.includes(d));
  const idx = order.map((d) => (d + 6) % 7);
  const ranges: string[] = [];
  for (let i = 0; i < idx.length; ) {
    let j = i;
    while (j + 1 < idx.length && idx[j + 1] === idx[j]! + 1) j++;
    ranges.push(j - i >= 2 ? `${DAY_NAMES[order[i]!]}–${DAY_NAMES[order[j]!]}` : order.slice(i, j + 1).map((d) => DAY_NAMES[d]).join(", "));
    i = j + 1;
  }
  return ranges.join(", ");
}

function WeeklyList({ pattern }: { pattern: WeeklyPattern }) {
  const groups = new Map<string, { kind: "busy" | "free"; label?: string; start: number; end: number; days: number[] }>();
  for (const r of cellsToRuns(pattern.cells)) {
    const k = `${r.kind}|${r.label ?? ""}|${r.startMinute}|${r.endMinute}`;
    const g = groups.get(k) ?? { kind: r.kind, label: r.label, start: r.startMinute, end: r.endMinute, days: [] };
    g.days.push(r.dayOfWeek);
    groups.set(k, g);
  }
  return (
    <div className="card p-4">
      <h2 className="mb-2 font-semibold">Every week</h2>
      {groups.size ? (
        <ul className="space-y-2">
          {[...groups.entries()].map(([k, g]) => (
            <li key={k} className="flex items-start gap-2 text-sm">
              <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${g.kind === "busy" ? "bg-nope" : "bg-go"}`} />
              <div className="flex-1">
                <div className="font-medium">{g.label || (g.kind === "busy" ? "Busy" : "Free")}</div>
                <div className="text-xs text-muted">
                  {daysLabel(g.days)} · {g.start === 0 && g.end === 24 * 60 ? "all day" : `${minuteLabel(g.start)}–${minuteLabel(g.end)}`}
                </div>
              </div>
              <button className="text-xs text-muted hover:text-nope" onClick={() => pattern.fill(g.days, g.start, g.end, undefined)}>
                remove
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-muted">Nothing repeating yet. Add work or class above, or paint on the calendar.</p>
      )}
    </div>
  );
}

function OneOffRow({ b }: { b: OneOffBlock }) {
  const qc = useQueryClient();
  const remove = useMutation(orpc.availability.remove.mutationOptions({ onSuccess: () => qc.invalidateQueries({ queryKey: orpc.availability.key() }) }));
  const s = b.startsAt!;
  const e = b.endsAt!;
  const multiDay = e.getTime() - s.getTime() > 864e5 || s.toDateString() !== new Date(e.getTime() - 1).toDateString();
  const fmt = (d: Date) => d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
  return (
    <li className="flex items-start gap-2 text-sm">
      <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${b.kind === "busy" ? "bg-nope" : "bg-go"}`} />
      <div className="flex-1">
        <div className="font-medium">{b.label || (b.kind === "busy" ? "Busy" : "Free")}</div>
        <div className="text-xs text-muted">
          {multiDay ? `${fmt(s)} → ${fmt(new Date(e.getTime() - 1))}` : `${fmt(s)}, ${timeRange(s, e)}`}
        </div>
      </div>
      <button className="text-xs text-muted hover:text-nope" onClick={() => remove.mutate({ blockId: b.id })}>remove</button>
    </li>
  );
}

const WEEKDAYS = [1, 2, 3, 4, 5];
const toMinutes = (t: string) => {
  const [h, m] = t.split(":").map(Number) as [number, number];
  return h * 60 + m;
};

function AddBlockForm({ pattern }: { pattern: WeeklyPattern }) {
  const qc = useQueryClient();
  const today = toLocalInput(new Date()).slice(0, 10);
  const [kind, setKind] = useState<"busy" | "free">("busy");
  const [repeat, setRepeat] = useState<"weekly" | "dates">("weekly");
  const [label, setLabel] = useState("");
  const [days, setDays] = useState<number[]>(WEEKDAYS);
  const [date, setDate] = useState(today);
  const [endDate, setEndDate] = useState(today);
  const [allDay, setAllDay] = useState(false);
  const [from, setFrom] = useState("09:00");
  const [to, setTo] = useState("17:00");
  const [error, setError] = useState<string | null>(null);
  const [added, setAdded] = useState(false);

  const add = useMutation({
    mutationFn: (blocks: { startsAt: Date; endsAt: Date }[]) =>
      Promise.all(blocks.map((b) => orpc.availability.addOneOff.call({ kind, label: label || undefined, ...b }))),
    onSuccess: () => qc.invalidateQueries({ queryKey: orpc.availability.key() }),
  });

  const submit = async () => {
    setError(null);
    const start = allDay ? 0 : toMinutes(from);
    const end = allDay ? 24 * 60 : toMinutes(to) || 24 * 60;
    if (end <= start) return setError("End time must be after the start time.");

    if (repeat === "weekly") {
      if (!days.length) return setError("Pick at least one day.");
      // The calendar works in half hours.
      pattern.fill(days, Math.floor(start / SLOT) * SLOT, Math.ceil(end / SLOT) * SLOT, { kind, label: label.trim() || undefined });
    } else {
      if (!date || !endDate) return setError("Pick the dates.");
      if (endDate < date) return setError("The end date is before the start date.");
      const last = endDate;
      const first = new Date(`${date}T00:00`);
      const stop = new Date(`${last}T00:00`);
      const count = Math.round((stop.getTime() - first.getTime()) / 864e5) + 1;
      if (count > 31) return setError("Keep it to a month at a time.");
      let blocks: { startsAt: Date; endsAt: Date }[];
      if (allDay) {
        stop.setDate(stop.getDate() + 1);
        blocks = [{ startsAt: first, endsAt: stop }];
      } else {
        // Same hours on each day in the range, e.g. a conference 9–5 Tue through Thu.
        blocks = Array.from({ length: count }, (_, i) => {
          const d = new Date(first);
          d.setDate(d.getDate() + i);
          const s = new Date(d);
          s.setMinutes(start);
          const e = new Date(d);
          e.setMinutes(end);
          return { startsAt: s, endsAt: e };
        });
      }
      try {
        await add.mutateAsync(blocks);
      } catch (e) {
        return setError(e instanceof Error ? e.message : "Couldn't add that.");
      }
    }
    setLabel("");
    setAdded(true);
    setTimeout(() => setAdded(false), 2000);
  };

  const seg = (on: boolean, color = "bg-gradient-to-r from-brand to-violet") =>
    `flex-1 rounded-full py-1 font-semibold transition ${on ? `${color} text-white` : "text-muted"}`;

  return (
    <form
      className="card space-y-3 p-4"
      onSubmit={(e) => {
        e.preventDefault();
        void submit();
      }}
    >
      <h2 className="font-semibold">Add to my calendar</h2>
      <div className="flex rounded-full border border-line bg-paper p-0.5 text-sm">
        <button type="button" onClick={() => setKind("busy")} className={seg(kind === "busy", "bg-nope")}>Busy</button>
        <button type="button" onClick={() => setKind("free")} className={seg(kind === "free", "bg-go")}>Free</button>
      </div>
      <input
        className="input"
        placeholder={kind === "busy" ? "Work, class, trip… (only you see this)" : "Free afternoon!"}
        value={label}
        onChange={(e) => setLabel(e.target.value)}
        maxLength={80}
      />
      <div className="flex rounded-full border border-line bg-paper p-0.5 text-sm">
        <button type="button" onClick={() => setRepeat("weekly")} className={seg(repeat === "weekly")}>Every week</button>
        <button type="button" onClick={() => setRepeat("dates")} className={seg(repeat === "dates")}>Specific dates</button>
      </div>

      {repeat === "weekly" ? (
        <div className="space-y-1.5">
          <div className="grid grid-cols-7 gap-1">
            {[1, 2, 3, 4, 5, 6, 0].map((d) => {
              const on = days.includes(d);
              return (
                <button
                  key={d}
                  type="button"
                  aria-pressed={on}
                  onClick={() => setDays((xs) => (on ? xs.filter((x) => x !== d) : [...xs, d]))}
                  className={`rounded-full py-1.5 text-xs font-bold transition ${on ? "bg-brand-soft text-brand ring-1 ring-brand/40" : "bg-paper text-muted hover:bg-brand-soft"}`}
                >
                  {DAY_NAMES[d]!.slice(0, 2)}
                </button>
              );
            })}
          </div>
          <div className="flex gap-3 text-xs font-semibold text-brand">
            <button type="button" onClick={() => setDays(WEEKDAYS)}>Weekdays</button>
            <button type="button" onClick={() => setDays([6, 0])}>Weekends</button>
            <button type="button" onClick={() => setDays([0, 1, 2, 3, 4, 5, 6])}>Every day</button>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-2">
          <label className="text-xs text-muted">
            From
            <input
              type="date"
              className="input mt-0.5"
              value={date}
              onChange={(e) => {
                setDate(e.target.value);
                if (endDate < e.target.value) setEndDate(e.target.value);
              }}
            />
          </label>
          <label className="text-xs text-muted">
            Through
            <input type="date" className="input mt-0.5" value={endDate} min={date} onChange={(e) => setEndDate(e.target.value)} />
          </label>
        </div>
      )}

      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" className="accent-brand" checked={allDay} onChange={(e) => setAllDay(e.target.checked)} /> All day
      </label>
      {!allDay && (
        <div className="flex items-center gap-2">
          <input type="time" className="input" aria-label="Start time" value={from} onChange={(e) => setFrom(e.target.value)} step={1800} />
          <span className="text-muted">to</span>
          <input type="time" className="input" aria-label="End time" value={to} onChange={(e) => setTo(e.target.value)} step={1800} />
        </div>
      )}
      {error && <p className="text-sm text-nope">{error}</p>}
      <button className="btn-primary w-full" disabled={add.isPending}>
        {add.isPending ? "Adding…" : added ? "Added ✓" : repeat === "weekly" ? "Add to every week" : "Add"}
      </button>
    </form>
  );
}
