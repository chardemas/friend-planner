"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { orpc } from "@/lib/orpc";
import { minuteLabel } from "@/lib/format";

type Cell = "busy" | "free" | undefined;
type Brush = "busy" | "free" | "erase";
type Block = { kind: "busy" | "free"; dayOfWeek: number | null; startMinute: number | null; endMinute: number | null };

// Display Monday-first; store Sunday=0 like Date.getDay().
const DAYS = [1, 2, 3, 4, 5, 6, 0];
const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const SLOT = 30;
const key = (d: number, m: number) => `${d}:${m}`;

function blocksToCells(blocks: Block[]) {
  const cells = new Map<string, Cell>();
  for (const b of blocks) {
    if (b.dayOfWeek === null || b.startMinute === null || b.endMinute === null) continue;
    for (let m = b.startMinute; m < b.endMinute; m += SLOT) cells.set(key(b.dayOfWeek, m), b.kind);
  }
  return cells;
}

function cellsToBlocks(cells: Map<string, Cell>, kind: "busy" | "free") {
  const out: { dayOfWeek: number; startMinute: number; endMinute: number }[] = [];
  for (const d of [0, 1, 2, 3, 4, 5, 6]) {
    let run: number | null = null;
    for (let m = 0; m <= 24 * 60; m += SLOT) {
      const on = m < 24 * 60 && cells.get(key(d, m)) === kind;
      if (on && run === null) run = m;
      if (!on && run !== null) {
        out.push({ dayOfWeek: d, startMinute: run, endMinute: m });
        run = null;
      }
    }
  }
  return out;
}

/** Paint your typical week: drag across cells to mark busy or free. */
export function WeekPainter({ blocks }: { blocks: Block[] }) {
  const qc = useQueryClient();
  const [cells, setCells] = useState(() => blocksToCells(blocks));
  const [brush, setBrush] = useState<Brush>("busy");
  const [dirty, setDirty] = useState(false);
  const [allDay, setAllDay] = useState(false);
  const painting = useRef<Cell | "erase" | null>(null);
  const lastCell = useRef<string | null>(null);

  useEffect(() => {
    if (!dirty) setCells(blocksToCells(blocks));
  }, [blocks, dirty]);

  const save = useMutation({
    mutationFn: async () => {
      await orpc.availability.setWeekly.call({ kind: "busy", blocks: cellsToBlocks(cells, "busy") });
      await orpc.availability.setWeekly.call({ kind: "free", blocks: cellsToBlocks(cells, "free") });
    },
    onSuccess: async () => {
      // Wait for fresh blocks before leaving edit mode, so the grid doesn't flash the old pattern.
      await qc.invalidateQueries({ queryKey: orpc.availability.key() });
      setDirty(false);
    },
  });

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
    setCells((prev) => {
      if (keys.every((x) => prev.get(x) === next)) return prev;
      const m = new Map(prev);
      for (const x of keys) {
        if (next) m.set(x, next);
        else m.delete(x);
      }
      return m;
    });
    setDirty(true);
  };

  const cellFromPoint = (x: number, y: number) =>
    (document.elementFromPoint(x, y) as HTMLElement | null)?.closest<HTMLElement>("[data-cell]")?.dataset.cell;

  const startMinute = allDay ? 0 : 7 * 60;
  const rows: number[] = [];
  for (let m = startMinute; m < 24 * 60; m += SLOT) rows.push(m);

  const colors: Record<string, string> = { busy: "bg-nope/80", free: "bg-go/80" };

  return (
    <div className="card min-w-0 overflow-hidden">
      <div className="flex flex-wrap items-center gap-2 border-b border-line p-3">
        <div className="flex rounded-lg border border-line p-0.5 text-sm">
          {(
            [
              ["busy", "Busy", "bg-nope text-white"],
              ["free", "Free", "bg-go text-white"],
              ["erase", "Erase", "bg-ink text-white"],
            ] as const
          ).map(([b, label, on]) => (
            <button key={b} onClick={() => setBrush(b)} className={`rounded-md px-3 py-1 font-medium ${brush === b ? on : "text-muted"}`}>
              {label}
            </button>
          ))}
        </div>
        <label className="flex items-center gap-1.5 text-xs text-muted">
          <input type="checkbox" className="accent-brand" checked={allDay} onChange={(e) => setAllDay(e.target.checked)} />
          show early morning
        </label>
        <div className="ml-auto flex items-center gap-2">
          {dirty && (
            <button className="text-sm text-muted" onClick={() => { setCells(blocksToCells(blocks)); setDirty(false); }}>
              Undo
            </button>
          )}
          <button className="btn-primary" disabled={!dirty || save.isPending} onClick={() => save.mutate()}>
            {save.isPending ? "Saving…" : dirty ? "Save my week" : "Saved"}
          </button>
        </div>
      </div>
      <div
        className="select-none overflow-x-auto"
        style={{ touchAction: "none" }}
        onPointerDown={(e) => {
          const k = cellFromPoint(e.clientX, e.clientY);
          if (!k) return;
          // Tapping a cell already painted with this brush clears it.
          const value = brush === "erase" ? "erase" : cells.get(k) === brush ? "erase" : brush;
          painting.current = value;
          lastCell.current = null;
          apply(k, value);
        }}
        onPointerMove={(e) => {
          if (painting.current === null) return;
          const k = cellFromPoint(e.clientX, e.clientY);
          if (k) apply(k, painting.current);
        }}
        onPointerUp={() => (painting.current = null)}
        onPointerLeave={() => (painting.current = null)}
      >
        <div className="grid min-w-[330px]" style={{ gridTemplateColumns: "48px repeat(7, 1fr)" }}>
          <div />
          {DAYS.map((d) => (
            <div key={d} className="border-b border-line py-1.5 text-center text-xs font-medium">{DAY_NAMES[d]}</div>
          ))}
          {rows.map((m) => (
            <Row key={m} m={m}>
              {DAYS.map((d) => {
                const c = cells.get(key(d, m));
                return (
                  <div
                    key={d}
                    data-cell={key(d, m)}
                    className={`h-4 cursor-pointer border-l border-line/70 ${m % 60 === 0 ? "border-t border-t-line" : ""} ${c ? colors[c] : "hover:bg-ink/5"}`}
                  />
                );
              })}
            </Row>
          ))}
        </div>
      </div>
      {save.error && <p className="p-3 text-sm text-nope">{save.error.message}</p>}
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
