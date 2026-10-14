"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { orpc } from "@/lib/orpc";
import { timeRange } from "@/lib/format";
import { WeekPainter } from "@/components/week-painter";

export default function AvailabilityPage() {
  const q = useQuery(orpc.availability.mine.queryOptions());
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">My week</h1>
        <p className="mt-1 max-w-2xl text-muted">
          Paint when you&apos;re <b className="text-nope">usually busy</b> (work, class, standing commitments) and when you&apos;re{" "}
          <b className="text-go">usually free</b>. Plans you say yes to block off time automatically. Friends see &quot;busy,&quot; not why.
        </p>
      </div>
      <div className="grid grid-cols-[minmax(0,1fr)] gap-6 lg:grid-cols-[1fr_320px]">
        {q.data ? <WeekPainter blocks={q.data.weekly} /> : <div className="card h-96 animate-pulse" />}
        <div className="space-y-4">
          <OneOffForm />
          <div className="card p-4">
            <h2 className="mb-2 font-semibold">Coming up</h2>
            {q.data?.oneOff.length ? (
              <ul className="space-y-2">
                {q.data.oneOff.map((b) => (
                  <OneOffRow key={b.id} b={b} />
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted">No one-off blocks. Add trips, deadlines, or a random free afternoon.</p>
            )}
          </div>
          {q.data && <p className="text-xs text-muted">Times are in {q.data.timezone.replace("_", " ")}.</p>}
        </div>
      </div>
    </div>
  );
}

function OneOffRow({ b }: { b: { id: string; kind: "busy" | "free"; label: string | null; startsAt: Date | null; endsAt: Date | null } }) {
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

function OneOffForm() {
  const qc = useQueryClient();
  const today = new Date().toISOString().slice(0, 10);
  const [kind, setKind] = useState<"busy" | "free">("busy");
  const [label, setLabel] = useState("");
  const [date, setDate] = useState(today);
  const [endDate, setEndDate] = useState(today);
  const [allDay, setAllDay] = useState(false);
  const [from, setFrom] = useState("18:00");
  const [to, setTo] = useState("22:00");
  const add = useMutation(
    orpc.availability.addOneOff.mutationOptions({
      onSuccess: () => {
        setLabel("");
        qc.invalidateQueries({ queryKey: orpc.availability.key() });
      },
    }),
  );
  return (
    <form
      className="card space-y-3 p-4"
      onSubmit={(e) => {
        e.preventDefault();
        const startsAt = new Date(`${date}T${allDay ? "00:00" : from}`);
        const endsAt = allDay ? new Date(`${endDate < date ? date : endDate}T00:00`) : new Date(`${date}T${to}`);
        if (allDay) endsAt.setDate(endsAt.getDate() + 1);
        add.mutate({ kind, label: label || undefined, startsAt, endsAt });
      }}
    >
      <h2 className="font-semibold">Block off a specific time</h2>
      <div className="flex rounded-lg border border-line p-0.5 text-sm">
        <button type="button" onClick={() => setKind("busy")} className={`flex-1 rounded-md py-1 ${kind === "busy" ? "bg-nope text-white" : "text-muted"}`}>Busy</button>
        <button type="button" onClick={() => setKind("free")} className={`flex-1 rounded-md py-1 ${kind === "free" ? "bg-go text-white" : "text-muted"}`}>Free</button>
      </div>
      <input className="input" placeholder={kind === "busy" ? "Out of town, deadline… (only you see this)" : "Free afternoon!"} value={label} onChange={(e) => setLabel(e.target.value)} maxLength={80} />
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" className="accent-brand" checked={allDay} onChange={(e) => setAllDay(e.target.checked)} /> All day / multiple days
      </label>
      {allDay ? (
        <div className="grid grid-cols-2 gap-2">
          <input type="date" className="input" value={date} onChange={(e) => setDate(e.target.value)} />
          <input type="date" className="input" value={endDate} min={date} onChange={(e) => setEndDate(e.target.value)} />
        </div>
      ) : (
        <div className="grid grid-cols-[minmax(0,1fr)_92px_92px] gap-2">
          <input type="date" className="input" value={date} onChange={(e) => setDate(e.target.value)} />
          <input type="time" className="input px-2" value={from} onChange={(e) => setFrom(e.target.value)} step={1800} />
          <input type="time" className="input px-2" value={to} onChange={(e) => setTo(e.target.value)} step={1800} />
        </div>
      )}
      {add.error && <p className="text-sm text-nope">{add.error.message}</p>}
      <button className="btn-primary w-full" disabled={add.isPending}>Add</button>
    </form>
  );
}
