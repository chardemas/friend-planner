"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { orpc } from "@/lib/orpc";
import { startOfWeek, time, toLocalInput } from "@/lib/format";
import { Avatar } from "./avatar";

const DAY_START_SLOT = 16; // 8am
const DAY_END_SLOT = 48; // midnight

/** Week heatmap: darker = more of the crew can make it. Click a cell to see who and start a plan there. */
export function CrewHeatmap({ crewId }: { crewId: string }) {
  const [weekOffset, setWeekOffset] = useState(0);
  const [showNight, setShowNight] = useState(false);
  const [selected, setSelected] = useState<number | null>(null);
  const weekStart = useMemo(() => {
    const d = startOfWeek(new Date());
    d.setDate(d.getDate() + weekOffset * 7);
    return d;
  }, [weekOffset]);
  const grid = useQuery(orpc.availability.crewGrid.queryOptions({ input: { crewId, weekStart, days: 7 } }));

  const data = grid.data;
  const total = data?.members.length ?? 0;
  const members = new Map(data?.members.map((m) => [m.userId, m]));
  // Slots are 30 minutes; split into days by local date.
  const days = useMemo(() => {
    if (!data) return [];
    const byDay = new Map<string, typeof data.slots>();
    for (const s of data.slots) {
      const k = s.start.toDateString();
      byDay.set(k, [...(byDay.get(k) ?? []), s]);
    }
    return [...byDay.values()];
  }, [data]);
  const firstRow = showNight ? 0 : DAY_START_SLOT;
  const rows = Array.from({ length: DAY_END_SLOT - firstRow }, (_, i) => firstRow + i);
  const sel = selected !== null ? data?.slots[selected] : undefined;

  const shade = (count: number) => {
    if (!total) return "transparent";
    const r = count / total;
    if (r === 1) return "var(--color-violet)";
    if (r === 0) return "var(--color-paper)";
    return `color-mix(in oklab, var(--color-violet) ${Math.round(15 + r * 60)}%, var(--color-violet-soft))`;
  };

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-4 lg:grid-cols-[1fr_260px]">
      <div className="card min-w-0 overflow-hidden">
        <div className="flex items-center gap-2 border-b border-line px-3 py-2 text-sm">
          <button className="btn-ghost px-2 py-1" onClick={() => setWeekOffset((w) => w - 1)} aria-label="Previous week">‹</button>
          <button className="btn-ghost px-2 py-1" onClick={() => setWeekOffset(0)}>This week</button>
          <button className="btn-ghost px-2 py-1" onClick={() => setWeekOffset((w) => w + 1)} aria-label="Next week">›</button>
          <span className="ml-1 font-medium">
            {weekStart.toLocaleDateString("en-US", { month: "short", day: "numeric" })}
          </span>
          <label className="ml-auto flex items-center gap-1.5 text-xs text-muted">
            <input type="checkbox" className="accent-brand" checked={showNight} onChange={(e) => setShowNight(e.target.checked)} />
            late night
          </label>
        </div>
        <div className="overflow-x-auto">
          <div className="grid min-w-[340px]" style={{ gridTemplateColumns: `44px repeat(${days.length || 7}, 1fr)` }}>
            <div />
            {days.map((d) => (
              <div key={d[0]!.start.toISOString()} className="border-b border-line py-1.5 text-center text-xs">
                <div className="font-medium">{d[0]!.start.toLocaleDateString("en-US", { weekday: "short" })}</div>
                <div className="text-muted">{d[0]!.start.getDate()}</div>
              </div>
            ))}
            {rows.map((r) => (
              <Row key={r} r={r}>
                {days.map((d, di) => {
                  const s = d[r];
                  if (!s) return <div key={di} />;
                  const idx = data!.slots.indexOf(s);
                  const past = s.start.getTime() + 30 * 60_000 < Date.now();
                  return (
                    <button
                      key={di}
                      onClick={() => setSelected(idx)}
                      title={`${time(s.start)}: ${s.availableCount}/${total} free`}
                      className={`h-4 border-l border-white/70 ${r % 2 === 0 ? "border-t border-t-white/80" : ""} ${selected === idx ? "outline-2 outline-brand -outline-offset-1" : ""}`}
                      style={{ background: shade(s.availableCount), opacity: past ? 0.35 : 1 }}
                    />
                  );
                })}
              </Row>
            ))}
          </div>
        </div>
        <div className="flex items-center gap-3 border-t border-line px-3 py-2 text-xs text-muted">
          <span className="flex items-center gap-1"><i className="inline-block h-3 w-3 rounded-sm" style={{ background: shade(0) }} /> nobody</span>
          <span className="flex items-center gap-1"><i className="inline-block h-3 w-3 rounded-sm" style={{ background: shade(total / 2) }} /> some</span>
          <span className="flex items-center gap-1"><i className="inline-block h-3 w-3 rounded-sm" style={{ background: shade(total) }} /> everyone</span>
          {grid.isFetching && <span className="ml-auto">updating…</span>}
        </div>
      </div>

      <div className="card p-4 text-sm">
        {sel ? (
          <>
            <div className="font-semibold">
              {sel.start.toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" })}, {time(sel.start)}
            </div>
            <div className="mb-3 text-muted">{sel.availableCount} of {total} can make it</div>
            <ul className="space-y-1.5">
              {data!.members.map((m) => {
                const busy = sel.busy.find((b) => b.userId === m.userId);
                const free = sel.free.includes(m.userId);
                return (
                  <li key={m.userId} className="flex items-center gap-2">
                    <Avatar name={m.name} color={m.color} size={22} />
                    <span className="flex-1">{m.name}</span>
                    {busy ? (
                      <span className="chip max-w-[120px] truncate bg-nope-soft text-nope">{busy.reason}</span>
                    ) : free ? (
                      <span className="chip bg-go-soft text-go">free 👍</span>
                    ) : (
                      <span className="chip bg-paper text-muted">probably ok</span>
                    )}
                  </li>
                );
              })}
            </ul>
            <Link
              className="btn-primary mt-4 w-full"
              href={`/plans/new?crew=${crewId}&start=${encodeURIComponent(toLocalInput(sel.start))}`}
            >
              Plan something then
            </Link>
          </>
        ) : (
          <div className="text-muted">
            <p className="font-medium text-ink">Who&apos;s free?</p>
            <p className="mt-1">
              Darker green means more of the crew is free. Tap a slot to see who&apos;s busy and start a plan there.
            </p>
            <p className="mt-3">
              It&apos;s built from everyone&apos;s weekly pattern, one-off blocks, and plans they already said yes to.
            </p>
          </div>
        )}
        {members.size === 0 && grid.isLoading && <p className="text-muted">Loading…</p>}
      </div>
    </div>
  );
}

function Row({ r, children }: { r: number; children: React.ReactNode }) {
  const label = r % 2 === 0 ? (r / 2 === 0 ? "12am" : r / 2 < 12 ? `${r / 2}am` : r / 2 === 12 ? "12pm" : `${r / 2 - 12}pm`) : "";
  return (
    <>
      <div className="-mt-1.5 pr-1.5 text-right text-[10px] leading-none text-muted">{label}</div>
      {children}
    </>
  );
}
