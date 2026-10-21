"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";
import { orpc } from "@/lib/orpc";
import { minuteLabel, startOfWeek } from "@/lib/format";

type Kind = "busy" | "free";
type Cell = { kind: Kind; label?: string };
type Cells = Map<string, Cell>;
type Brush = Kind | "erase";
export type WeeklyBlock = { kind: Kind; label: string | null; dayOfWeek: number | null; startMinute: number | null; endMinute: number | null };
export type OneOffBlock = { id: string; kind: Kind; label: string | null; startsAt: Date | null; endsAt: Date | null };

export const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
export const SLOT = 30;
const DAY_MS = 864e5;
const key = (d: number, m: number) => `${d}:${m}`;
const same = (a?: Cell, b?: Cell) => a?.kind === b?.kind && (a?.label ?? "") === (b?.label ?? "");

function blocksToCells(blocks: WeeklyBlock[]) {
  const cells: Cells = new Map();
  for (const b of blocks) {
    if (b.dayOfWeek === null || b.startMinute === null || b.endMinute === null) continue;
    for (let m = b.startMinute; m < b.endMinute; m += SLOT) cells.set(key(b.dayOfWeek, m), { kind: b.kind, label: b.label ?? undefined });
  }
  return cells;
}

/** Collapse cells into runs of the same kind and label, per weekday. */
export function cellsToRuns(cells: Cells) {
  const out: { dayOfWeek: number; startMinute: number; endMinute: number; kind: Kind; label?: string }[] = [];
  for (const d of [0, 1, 2, 3, 4, 5, 6]) {
    let run: { start: number; cell: Cell } | null = null;
    for (let m = 0; m <= 24 * 60; m += SLOT) {
      const c = m < 24 * 60 ? cells.get(key(d, m)) : undefined;
      if (run && !same(run.cell, c)) {
        out.push({ dayOfWeek: d, startMinute: run.start, endMinute: m, ...run.cell });
        run = null;
      }
      if (c && !run) run = { start: m, cell: c };
    }
  }
  return out;
}

/**
 * The user's repeating week as editable half-hour cells. Edits save themselves
 * shortly after they stop, so there's no Save button to forget.
 */
export function useWeeklyPattern(blocks: WeeklyBlock[]) {
  const qc = useQueryClient();
  const [cells, setCells] = useState(() => blocksToCells(blocks));
  const [dirty, setDirty] = useState(false);
  const edits = useRef(0);

  useEffect(() => {
    if (!dirty) setCells(blocksToCells(blocks));
  }, [blocks, dirty]);

  const save = useMutation({
    mutationFn: async ({ snapshot }: { snapshot: Cells; version: number }) => {
      const runs = cellsToRuns(snapshot);
      for (const kind of ["busy", "free"] as const) {
        const mine = runs.filter((r) => r.kind === kind).map(({ kind: _, ...r }) => r);
        await orpc.availability.setWeekly.call({ kind, blocks: mine });
      }
    },
    onSuccess: async (_, { version }) => {
      // Wait for fresh blocks before leaving edit mode, so the grid doesn't flash the old pattern.
      await qc.invalidateQueries({ queryKey: orpc.availability.key() });
      if (version === edits.current) setDirty(false);
    },
  });

  useEffect(() => {
    if (!dirty || save.isPending) return;
    const t = setTimeout(() => save.mutate({ snapshot: cells, version: edits.current }), 700);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cells, dirty, save.isPending]);

  // Kept in sync immediately, so several edits between renders (fast drags) build on each other.
  const latest = useRef(cells);
  latest.current = cells;
  const update = (fn: (prev: Cells) => Cells) => {
    const next = fn(latest.current);
    if (next === latest.current) return;
    latest.current = next;
    edits.current++;
    setCells(next);
    setDirty(true);
  };

  /** Set (or clear, with `cell` undefined) every slot from `start` to `end` minutes on each of `days`. */
  const fill = (days: number[], start: number, end: number, cell: Cell | undefined) =>
    update((prev) => {
      const m = new Map(prev);
      for (const d of days)
        for (let t = start; t < end; t += SLOT) {
          if (cell) m.set(key(d, t), cell);
          else m.delete(key(d, t));
        }
      return m;
    });

  const status: "saving" | "saved" | "error" = save.isError && !dirty ? "error" : dirty || save.isPending ? "saving" : "saved";
  return { cells, update, fill, status, error: save.error };
}

export type WeeklyPattern = ReturnType<typeof useWeeklyPattern>;

const COLORS: Record<Kind, string> = { busy: "var(--color-nope)", free: "var(--color-go)" };
const cellStyle = (kind: Kind, oneOff: boolean): React.CSSProperties =>
  oneOff
    ? { background: `repeating-linear-gradient(135deg, ${COLORS[kind]} 0 6px, color-mix(in oklab, ${COLORS[kind]} 75%, white) 6px 12px)` }
    : { background: `color-mix(in oklab, ${COLORS[kind]} 78%, white)` };

/** A real, dated week: your repeating pattern (paintable) with one-off blocks drawn on top. */
export function WeekPainter({ pattern, oneOff }: { pattern: WeeklyPattern; oneOff: OneOffBlock[] }) {
  const { cells, update, status } = pattern;
  const [brush, setBrush] = useState<Brush>("busy");
  const [early, setEarly] = useState(false);
  const [weekOffset, setWeekOffset] = useState(0);
  const painting = useRef<Cell | "erase" | null>(null);
  const lastCell = useRef<string | null>(null);

  const dates = useMemo(() => {
    const start = startOfWeek(new Date());
    start.setDate(start.getDate() + weekOffset * 7);
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(start);
      d.setDate(d.getDate() + i);
      return d;
    });
  }, [weekOffset]);

  const startMinute = early ? 0 : 7 * 60;
  const rows: number[] = [];
  for (let m = startMinute; m < 24 * 60; m += SLOT) rows.push(m);

  /** One-off blocks that touch this week, keyed by `${column}:${minute}`. */
  const overlay = useMemo(() => {
    const map = new Map<string, Cell & { id: string }>();
    for (const b of oneOff) {
      const s = b.startsAt!.getTime();
      const e = b.endsAt!.getTime();
      dates.forEach((date, i) => {
        if (e <= date.getTime() || s >= date.getTime() + DAY_MS) return;
        for (let m = 0; m < 24 * 60; m += SLOT) {
          const slot = new Date(date);
          slot.setMinutes(m);
          if (s < slot.getTime() + SLOT * 6e4 && e > slot.getTime()) map.set(key(i, m), { kind: b.kind, label: b.label ?? undefined, id: b.id });
        }
      });
    }
    return map;
  }, [oneOff, dates]);

  /** Paint `k`, plus any cells skipped between it and the last one when dragging fast within a day. */
  const apply = (k: string, value: Cell | "erase") => {
    const keys = [k];
    const prevKey = lastCell.current;
    if (prevKey) {
      const [d0, m0] = prevKey.split(":").map(Number) as [number, number];
      const [d1, m1] = k.split(":").map(Number) as [number, number];
      if (d0 === d1) for (let m = Math.min(m0, m1); m <= Math.max(m0, m1); m += SLOT) keys.push(key(d1, m));
    }
    lastCell.current = k;
    const next = value === "erase" ? undefined : value;
    update((prev) => {
      if (keys.every((x) => same(prev.get(x), next))) return prev;
      const m = new Map(prev);
      for (const x of keys) {
        if (next) m.set(x, next);
        else m.delete(x);
      }
      return m;
    });
  };

  const qc = useQueryClient();
  const removeOneOff = useMutation(
    orpc.availability.remove.mutationOptions({ onSettled: () => qc.invalidateQueries({ queryKey: orpc.availability.key() }) }),
  );
  const erased = useRef(new Set<string>());

  /** Paint a weekly cell, or (with the eraser) delete a one-off block the pointer touches. */
  const hit = (x: number, y: number, value: Cell | "erase") => {
    const el = (document.elementFromPoint(x, y) as HTMLElement | null)?.closest<HTMLElement>("[data-cell],[data-block]");
    if (!el) return;
    if (el.dataset.cell) return apply(el.dataset.cell, value);
    const id = el.dataset.block!;
    if (value === "erase" && !erased.current.has(id)) {
      erased.current.add(id);
      removeOneOff.mutate({ blockId: id });
    }
  };

  const today = new Date().toDateString();
  const first = dates[0]!;
  const last = dates[6]!;
  const monthTitle =
    first.getMonth() === last.getMonth()
      ? first.toLocaleDateString("en-US", { month: "long", year: "numeric" })
      : `${first.toLocaleDateString("en-US", { month: "short" })} – ${last.toLocaleDateString("en-US", { month: "short", year: "numeric" })}`;

  return (
    <div className="card min-w-0 overflow-hidden">
      <div className="flex flex-wrap items-center gap-2 border-b border-line p-3">
        <h2 className="mr-1 text-lg font-semibold">{monthTitle}</h2>
        <div className="flex items-center gap-1">
          <button className="btn-ghost px-2.5 py-1" onClick={() => setWeekOffset((w) => w - 1)} aria-label="Previous week">‹</button>
          <button className="btn-ghost px-3 py-1" onClick={() => setWeekOffset(0)} disabled={weekOffset === 0}>Today</button>
          <button className="btn-ghost px-2.5 py-1" onClick={() => setWeekOffset((w) => w + 1)} aria-label="Next week">›</button>
        </div>
        <span className="ml-auto text-xs font-semibold text-muted" aria-live="polite">
          {status === "saving" ? "Saving…" : status === "error" ? <span className="text-nope">Couldn&apos;t save — try again</span> : "Saved ✓"}
        </span>
      </div>
      <div className="flex flex-wrap items-center gap-2 border-b border-line px-3 py-2">
        <span className="text-xs text-muted">Drag to paint your usual week:</span>
        <div className="flex rounded-full border border-line bg-paper p-0.5 text-sm">
          {(
            [
              ["busy", "Busy", "bg-nope text-white"],
              ["free", "Free", "bg-go text-white"],
              ["erase", "Erase", "bg-ink text-white"],
            ] as const
          ).map(([b, label, on]) => (
            <button key={b} onClick={() => setBrush(b)} className={`rounded-full px-3 py-1 font-semibold transition ${brush === b ? on : "text-muted"}`}>
              {label}
            </button>
          ))}
        </div>
        <label className="ml-auto flex items-center gap-1.5 text-xs text-muted">
          <input type="checkbox" className="accent-brand" checked={early} onChange={(e) => setEarly(e.target.checked)} />
          early morning
        </label>
      </div>
      <div
        className="select-none overflow-x-auto"
        style={{ touchAction: "none" }}
        onPointerDown={(e) => {
          const value: Cell | "erase" = brush === "erase" ? "erase" : { kind: brush };
          painting.current = value;
          lastCell.current = null;
          erased.current = new Set();
          hit(e.clientX, e.clientY, value);
        }}
        onPointerMove={(e) => {
          if (painting.current === null) return;
          hit(e.clientX, e.clientY, painting.current);
        }}
        onPointerUp={() => (painting.current = null)}
        onPointerLeave={() => (painting.current = null)}
      >
        <div className="grid min-w-[340px]" style={{ gridTemplateColumns: "44px repeat(7, 1fr)" }}>
          <div className="border-b border-line" />
          {dates.map((date) => {
            const isToday = date.toDateString() === today;
            return (
              <div key={date.toDateString()} className="border-b border-line py-1.5 text-center">
                <div className={`text-[11px] font-semibold ${isToday ? "text-brand" : "text-muted"}`}>{DAY_NAMES[date.getDay()]}</div>
                <div
                  className={`mx-auto mt-0.5 flex h-7 w-7 items-center justify-center rounded-full text-sm font-bold ${
                    isToday ? "bg-gradient-to-br from-brand to-violet text-white shadow-(--shadow-glow)" : ""
                  }`}
                >
                  {date.getDate()}
                </div>
              </div>
            );
          })}
          {rows.map((m) => (
            <Row key={m} m={m}>
              {dates.map((date, i) => {
                const dow = date.getDay();
                const shown = (t: number) => overlay.get(key(i, t)) ?? cells.get(key(dow, t));
                const extra = overlay.get(key(i, m));
                const c = shown(m);
                // Label the first slot of each run.
                const runStart = c && (m === startMinute || !same(shown(m - SLOT), c) || overlay.has(key(i, m - SLOT)) !== !!extra);
                return (
                  <div
                    key={i}
                    // One-off blocks sit on top: the eraser deletes them, other brushes leave them alone.
                    data-cell={extra ? undefined : key(dow, m)}
                    data-block={extra?.id}
                    title={c ? `${c.label ?? (c.kind === "busy" ? "Busy" : "Free")}${extra ? " (just this date)" : " (every week)"}` : undefined}
                    className={`relative h-4 border-l border-line/70 ${m % 60 === 0 ? "border-t border-t-line" : ""} ${extra && brush !== "erase" ? "cursor-default" : "cursor-pointer"} ${c ? "" : "hover:bg-brand-soft"}`}
                    style={c ? cellStyle(c.kind, !!extra) : undefined}
                  >
                    {runStart && c.label && (
                      <span className="pointer-events-none absolute inset-x-0 top-0 z-10 truncate px-1 text-[10px] font-bold leading-4 text-white">
                        {c.label}
                      </span>
                    )}
                  </div>
                );
              })}
            </Row>
          ))}
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-3 border-t border-line px-3 py-2 text-xs text-muted">
        <span className="flex items-center gap-1"><i className="inline-block h-3 w-3 rounded-sm" style={cellStyle("busy", false)} /> busy every week</span>
        <span className="flex items-center gap-1"><i className="inline-block h-3 w-3 rounded-sm" style={cellStyle("busy", true)} /> just this date</span>
        <span className="flex items-center gap-1"><i className="inline-block h-3 w-3 rounded-sm" style={cellStyle("free", false)} /> free</span>
      </div>
    </div>
  );
}

function Row({ m, children }: { m: number; children: React.ReactNode }) {
  return (
    <>
      <div className="-mt-1.5 pr-1.5 text-right text-[10px] leading-none text-muted">{m % 60 === 0 ? minuteLabel(m) : ""}</div>
      {children}
    </>
  );
}
