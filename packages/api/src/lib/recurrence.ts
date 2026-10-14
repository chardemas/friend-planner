import { WEEK, addZonedDays } from "./time";

export interface RecurringPlanLike {
  startsAt: Date;
  endsAt: Date;
  repeatsWeekly: boolean;
  repeatUntil: Date | null;
  timezone: string;
}

export interface Occurrence {
  start: Date;
  end: Date;
}

/** Hard cap so a bad query can't expand an unbounded series. */
const MAX_OCCURRENCES = 200;

/**
 * Occurrences of a plan that overlap [from, to). Weekly plans repeat at the same
 * wall-clock time in the plan's timezone, so a 7pm game stays 7pm across DST.
 */
export function expandOccurrences(plan: RecurringPlanLike, from: Date, to: Date): Occurrence[] {
  const duration = plan.endsAt.getTime() - plan.startsAt.getTime();
  if (!plan.repeatsWeekly) {
    return plan.startsAt < to && plan.endsAt > from ? [{ start: plan.startsAt, end: plan.endsAt }] : [];
  }
  const out: Occurrence[] = [];
  // Jump close to the window, then walk week by week (a DST shift is at most an hour, so start one week early).
  let k = Math.max(0, Math.floor((from.getTime() - plan.endsAt.getTime()) / WEEK) - 1);
  for (let i = 0; i < MAX_OCCURRENCES + 2; i++, k++) {
    const start = k === 0 ? plan.startsAt : addZonedDays(plan.startsAt, 7 * k, plan.timezone);
    if (start >= to) break;
    if (plan.repeatUntil && start > plan.repeatUntil) break;
    const end = new Date(start.getTime() + duration);
    if (end > from) out.push({ start, end });
    if (out.length >= MAX_OCCURRENCES) break;
  }
  return out;
}

/** True when `occurrenceStart` is a real occurrence of the plan. */
export function isOccurrence(plan: RecurringPlanLike, occurrenceStart: Date) {
  const t = occurrenceStart.getTime();
  return expandOccurrences(plan, new Date(t), new Date(t + 1)).some((o) => o.start.getTime() === t);
}
