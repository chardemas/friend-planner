/**
 * Minimal, dependency-free time-zone helpers built on Intl.
 * Weekly things (availability, recurring plans) are defined in wall-clock time
 * in a zone, so "Tuesdays 7pm" stays 7pm across DST changes.
 */

export const MINUTE = 60_000;
export const HOUR = 60 * MINUTE;
export const DAY = 24 * HOUR;
export const WEEK = 7 * DAY;

const formatters = new Map<string, Intl.DateTimeFormat>();
function formatter(timeZone: string) {
  let f = formatters.get(timeZone);
  if (!f) {
    f = new Intl.DateTimeFormat("en-US", {
      timeZone,
      hourCycle: "h23",
      year: "numeric",
      month: "numeric",
      day: "numeric",
      hour: "numeric",
      minute: "numeric",
      second: "numeric",
      weekday: "short",
    });
    formatters.set(timeZone, f);
  }
  return f;
}

const WEEKDAYS: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

export interface ZonedParts {
  year: number;
  month: number; // 1-12
  day: number;
  hour: number;
  minute: number;
  second: number;
  /** 0 = Sunday */
  weekday: number;
  minuteOfDay: number;
}

export function isValidTimeZone(tz: string) {
  try {
    formatter(tz);
    return true;
  } catch {
    return false;
  }
}

export function zonedParts(date: Date | number, timeZone: string): ZonedParts {
  const parts = formatter(timeZone).formatToParts(new Date(date));
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "0";
  const hour = Number(get("hour")) % 24;
  const minute = Number(get("minute"));
  return {
    year: Number(get("year")),
    month: Number(get("month")),
    day: Number(get("day")),
    hour,
    minute,
    second: Number(get("second")),
    weekday: WEEKDAYS[get("weekday")] ?? 0,
    minuteOfDay: hour * 60 + minute,
  };
}

/** Offset of the zone from UTC at the given instant, in ms (e.g. New York in summer = -4h). */
export function zoneOffset(date: Date | number, timeZone: string) {
  const ms = new Date(date).getTime();
  const p = zonedParts(ms, timeZone);
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return asUtc - (ms - (ms % 1000));
}

/**
 * The instant at which the wall clock in `timeZone` reads year-month-day + minuteOfDay.
 * Days and minutes may overflow (day 32, minute 1500); they roll over like Date.UTC.
 * Times skipped by a DST jump resolve forward; repeated times resolve to the first one.
 */
export function zonedToUtc(year: number, month: number, day: number, minuteOfDay: number, timeZone: string): Date {
  const wall = Date.UTC(year, month - 1, day, 0, minuteOfDay);
  let guess = wall - zoneOffset(wall, timeZone);
  const second = wall - zoneOffset(guess, timeZone);
  if (second !== guess) {
    // Crossed a DST boundary between the two guesses; prefer whichever reproduces the wall time.
    const p = zonedParts(second, timeZone);
    guess = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute) === wall ? second : Math.max(guess, second);
  }
  return new Date(guess);
}

/** Midnight (local) of the day containing `date` in `timeZone`. */
export function startOfZonedDay(date: Date | number, timeZone: string) {
  const p = zonedParts(date, timeZone);
  return zonedToUtc(p.year, p.month, p.day, 0, timeZone);
}

/** Same wall-clock time `days` calendar days later (DST-safe). */
export function addZonedDays(date: Date | number, days: number, timeZone: string) {
  const p = zonedParts(date, timeZone);
  return zonedToUtc(p.year, p.month, p.day + days, p.minuteOfDay, timeZone);
}
