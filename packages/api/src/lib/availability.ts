import { type Interval, mergeIntervals, overlaps, unionCovers } from "./intervals";
import { DAY, MINUTE, addZonedDays, startOfZonedDay, zonedParts, zonedToUtc } from "./time";

export interface WeeklyBlock {
  dayOfWeek: number;
  startMinute: number;
  endMinute: number;
}

export interface BlockLike {
  kind: "busy" | "free";
  label: string | null;
  dayOfWeek: number | null;
  startMinute: number | null;
  endMinute: number | null;
  startsAt: Date | null;
  endsAt: Date | null;
}

export interface Reason extends Interval {
  /** What to show other people: "Busy", or a plan title they can see. */
  label: string;
  source: "block" | "plan";
}

export interface MemberAvailability {
  userId: string;
  /** Times they can't make it: busy blocks and plans they're going to. */
  busy: Reason[];
  /** Times they explicitly marked as good. */
  free: Interval[];
}

/** Expand a user's weekly + one-off blocks into concrete intervals within [from, to). */
export function expandBlocks(blocks: BlockLike[], timeZone: string, from: Date, to: Date) {
  const busy: Reason[] = [];
  const free: Interval[] = [];
  const window = { start: from.getTime(), end: to.getTime() };
  const push = (b: BlockLike, i: Interval) => {
    if (!overlaps(i, window)) return;
    if (b.kind === "busy") busy.push({ ...i, label: b.label || "Busy", source: "block" });
    else free.push(i);
  };

  const weekly = blocks.filter((b) => b.dayOfWeek !== null);
  if (weekly.length) {
    // Walk local days, starting one day early so overnight edges are included.
    let day = addZonedDays(startOfZonedDay(from, timeZone), -1, timeZone);
    while (day.getTime() < to.getTime()) {
      const p = zonedParts(day, timeZone);
      for (const b of weekly) {
        if (b.dayOfWeek !== p.weekday) continue;
        const start = zonedToUtc(p.year, p.month, p.day, b.startMinute!, timeZone).getTime();
        const end = zonedToUtc(p.year, p.month, p.day, b.endMinute!, timeZone).getTime();
        push(b, { start, end });
      }
      const next = addZonedDays(day, 1, timeZone);
      day = next.getTime() > day.getTime() ? next : new Date(day.getTime() + DAY);
    }
  }
  for (const b of blocks) {
    if (b.startsAt && b.endsAt) push(b, { start: b.startsAt.getTime(), end: b.endsAt.getTime() });
  }
  return { busy, free };
}

/**
 * Collapse a set of selected 30-minute cells (dayOfWeek, minute) into the fewest weekly blocks.
 * Used by the paint-your-week grid.
 */
export function cellsToWeeklyBlocks(cells: { dayOfWeek: number; minute: number }[], slotMinutes = 30): WeeklyBlock[] {
  const byDay = new Map<number, number[]>();
  for (const c of cells) byDay.set(c.dayOfWeek, [...(byDay.get(c.dayOfWeek) ?? []), c.minute]);
  const out: WeeklyBlock[] = [];
  for (const [dayOfWeek, minutes] of [...byDay].sort((a, b) => a[0] - b[0])) {
    const merged = mergeIntervals([...new Set(minutes)].map((m) => ({ start: m, end: m + slotMinutes })));
    for (const m of merged) out.push({ dayOfWeek, startMinute: m.start, endMinute: m.end });
  }
  return out;
}

export type SlotStatus = "free" | "open" | "busy";

export interface GridSlot {
  start: Date;
  end: Date;
  /** Members not blocked for this slot (open + explicitly free). */
  availableCount: number;
  members: { userId: string; status: SlotStatus; reason?: string }[];
}

/** Status of each member for each slot, for the crew heatmap. */
export function buildGrid(members: MemberAvailability[], from: Date, slotCount: number, slotMinutes = 30): GridSlot[] {
  const slots: GridSlot[] = [];
  for (let i = 0; i < slotCount; i++) {
    const start = from.getTime() + i * slotMinutes * MINUTE;
    const slot = { start, end: start + slotMinutes * MINUTE };
    const statuses = members.map((m) => {
      const reason = m.busy.find((b) => overlaps(b, slot));
      if (reason) return { userId: m.userId, status: "busy" as const, reason: reason.label };
      return { userId: m.userId, status: unionCovers(m.free, slot) ? ("free" as const) : ("open" as const) };
    });
    slots.push({
      start: new Date(slot.start),
      end: new Date(slot.end),
      availableCount: statuses.filter((s) => s.status !== "busy").length,
      members: statuses,
    });
  }
  return slots;
}

export interface Suggestion {
  start: Date;
  end: Date;
  availableUserIds: string[];
  /** Subset of available who explicitly marked the whole window as free. */
  preferredUserIds: string[];
  unavailable: { userId: string; reason: string }[];
}

export interface SuggestOptions {
  from: Date;
  to: Date;
  durationMinutes: number;
  timeZone: string;
  earliestHour: number;
  latestHour: number;
  stepMinutes?: number;
  limit: number;
  /** Don't suggest times that already started. */
  now?: Date;
}

/**
 * Rank candidate windows by how many people can make it, then by how many explicitly
 * said they're free, then earliest first. Picks non-overlapping windows.
 */
export function suggestTimes(members: MemberAvailability[], opts: SuggestOptions): Suggestion[] {
  const step = (opts.stepMinutes ?? 30) * MINUTE;
  const duration = opts.durationMinutes * MINUTE;
  const earliest = Math.max(opts.from.getTime(), opts.now?.getTime() ?? 0);
  // Align to the step so suggestions land on :00 / :30.
  let t = Math.ceil(earliest / step) * step;
  const candidates: Suggestion[] = [];
  while (t + duration <= opts.to.getTime()) {
    const window = { start: t, end: t + duration };
    const startParts = zonedParts(t, opts.timeZone);
    const endParts = zonedParts(t + duration - 1, opts.timeZone);
    const sameDay = startParts.day === endParts.day;
    const endMinute = startParts.minuteOfDay + opts.durationMinutes;
    if (sameDay && startParts.minuteOfDay >= opts.earliestHour * 60 && endMinute <= opts.latestHour * 60) {
      const available: string[] = [];
      const preferred: string[] = [];
      const unavailable: Suggestion["unavailable"] = [];
      for (const m of members) {
        const reason = m.busy.find((b) => overlaps(b, window));
        if (reason) unavailable.push({ userId: m.userId, reason: reason.label });
        else {
          available.push(m.userId);
          if (unionCovers(m.free, window)) preferred.push(m.userId);
        }
      }
      candidates.push({
        start: new Date(window.start),
        end: new Date(window.end),
        availableUserIds: available,
        preferredUserIds: preferred,
        unavailable,
      });
    }
    t += step;
  }
  candidates.sort(
    (a, b) =>
      b.availableUserIds.length - a.availableUserIds.length ||
      b.preferredUserIds.length - a.preferredUserIds.length ||
      a.start.getTime() - b.start.getTime(),
  );
  const picked: Suggestion[] = [];
  for (const c of candidates) {
    if (picked.length >= opts.limit) break;
    const ci = { start: c.start.getTime(), end: c.end.getTime() };
    if (picked.some((p) => overlaps(ci, { start: p.start.getTime(), end: p.end.getTime() }))) continue;
    picked.push(c);
  }
  return picked;
}
