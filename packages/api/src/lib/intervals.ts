/** Half-open [start, end) intervals in epoch milliseconds. */
export interface Interval {
  start: number;
  end: number;
}

export function overlaps(a: Interval, b: Interval) {
  return a.start < b.end && b.start < a.end;
}

export function covers(outer: Interval, inner: Interval) {
  return outer.start <= inner.start && outer.end >= inner.end;
}

export function mergeIntervals<T extends Interval>(intervals: T[]): Interval[] {
  const sorted = [...intervals].sort((a, b) => a.start - b.start);
  const out: Interval[] = [];
  for (const i of sorted) {
    const last = out[out.length - 1];
    if (last && i.start <= last.end) last.end = Math.max(last.end, i.end);
    else out.push({ start: i.start, end: i.end });
  }
  return out;
}

/** Whether `window` is fully covered by the union of `intervals`. */
export function unionCovers(intervals: Interval[], window: Interval) {
  return mergeIntervals(intervals).some((i) => covers(i, window));
}
