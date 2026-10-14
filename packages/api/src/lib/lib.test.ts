import { describe, expect, it } from "vitest";
import { buildGrid, cellsToWeeklyBlocks, expandBlocks, suggestTimes, type BlockLike } from "./availability";
import { netBalances, simplifyDebts, splitEqually } from "./balances";
import { expandOccurrences, isOccurrence } from "./recurrence";
import { HOUR, addZonedDays, startOfZonedDay, zonedParts, zonedToUtc } from "./time";

const NY = "America/New_York";

describe("time", () => {
  it("converts wall time to UTC on both sides of DST", () => {
    expect(zonedToUtc(2026, 7, 1, 19 * 60, NY).toISOString()).toBe("2026-07-01T23:00:00.000Z");
    expect(zonedToUtc(2026, 12, 1, 19 * 60, NY).toISOString()).toBe("2026-12-02T00:00:00.000Z");
  });
  it("resolves the spring-forward gap forward", () => {
    // 2:30am on 2026-03-08 doesn't exist in New York.
    const d = zonedToUtc(2026, 3, 8, 150, NY);
    expect(zonedParts(d, NY).hour).toBe(3);
  });
  it("keeps wall-clock time when adding days across DST", () => {
    const sat = zonedToUtc(2026, 10, 31, 19 * 60, NY);
    const next = addZonedDays(sat, 7, NY);
    expect(zonedParts(next, NY)).toMatchObject({ day: 7, month: 11, hour: 19, minute: 0 });
    expect(next.getTime() - sat.getTime()).toBe(7 * 24 * HOUR + HOUR);
  });
  it("finds local midnight", () => {
    const d = startOfZonedDay(new Date("2026-10-14T03:30:00Z"), NY); // 11:30pm on the 13th locally
    expect(d.toISOString()).toBe("2026-10-13T04:00:00.000Z");
  });
});

describe("recurrence", () => {
  const plan = {
    startsAt: zonedToUtc(2026, 10, 6, 19 * 60, NY), // Tue 7pm
    endsAt: zonedToUtc(2026, 10, 6, 21 * 60, NY),
    repeatsWeekly: true,
    repeatUntil: null,
    timezone: NY,
  };
  it("expands weekly occurrences in a window, keeping 7pm after DST ends", () => {
    const occ = expandOccurrences(plan, new Date("2026-10-26T00:00:00Z"), new Date("2026-11-12T00:00:00Z"));
    expect(occ.map((o) => zonedParts(o.start, NY)).map((p) => `${p.month}/${p.day} ${p.hour}`)).toEqual([
      "10/27 19",
      "11/3 19",
      "11/10 19",
    ]);
  });
  it("respects repeatUntil", () => {
    const occ = expandOccurrences(
      { ...plan, repeatUntil: zonedToUtc(2026, 10, 20, 23 * 60, NY) },
      new Date("2026-10-01T00:00:00Z"),
      new Date("2026-12-01T00:00:00Z"),
    );
    expect(occ).toHaveLength(3);
  });
  it("one-off plans only appear when overlapping", () => {
    const one = { ...plan, repeatsWeekly: false };
    expect(expandOccurrences(one, new Date("2026-10-08T00:00:00Z"), new Date("2026-10-09T00:00:00Z"))).toHaveLength(0);
    expect(expandOccurrences(one, new Date("2026-10-06T00:00:00Z"), new Date("2026-10-08T00:00:00Z"))).toHaveLength(1);
  });
  it("validates occurrence starts", () => {
    expect(isOccurrence(plan, zonedToUtc(2026, 10, 13, 19 * 60, NY))).toBe(true);
    expect(isOccurrence(plan, zonedToUtc(2026, 10, 14, 19 * 60, NY))).toBe(false);
  });
});

describe("availability", () => {
  const block = (b: Partial<BlockLike>): BlockLike => ({
    kind: "busy",
    label: null,
    dayOfWeek: null,
    startMinute: null,
    endMinute: null,
    startsAt: null,
    endsAt: null,
    ...b,
  });
  const weekStart = zonedToUtc(2026, 10, 12, 0, NY); // Monday

  it("expands weekly blocks in the user's zone", () => {
    const { busy } = expandBlocks(
      [block({ dayOfWeek: 1, startMinute: 9 * 60, endMinute: 17 * 60, label: "Work" })],
      NY,
      weekStart,
      new Date(weekStart.getTime() + 7 * 24 * HOUR),
    );
    expect(busy).toHaveLength(1);
    expect(new Date(busy[0]!.start).toISOString()).toBe("2026-10-12T13:00:00.000Z");
    expect(busy[0]!.label).toBe("Work");
  });

  it("merges painted cells into blocks", () => {
    expect(
      cellsToWeeklyBlocks([
        { dayOfWeek: 2, minute: 600 },
        { dayOfWeek: 2, minute: 630 },
        { dayOfWeek: 2, minute: 720 },
        { dayOfWeek: 0, minute: 0 },
      ]),
    ).toEqual([
      { dayOfWeek: 0, startMinute: 0, endMinute: 30 },
      { dayOfWeek: 2, startMinute: 600, endMinute: 660 },
      { dayOfWeek: 2, startMinute: 720, endMinute: 750 },
    ]);
  });

  const at = (h: number) => zonedToUtc(2026, 10, 12, h * 60, NY).getTime();
  const members = [
    { userId: "a", busy: [{ start: at(9), end: at(17), label: "Busy", source: "block" as const }], free: [] },
    { userId: "b", busy: [], free: [{ start: at(18), end: at(23) }] },
    { userId: "c", busy: [{ start: at(18), end: at(19), label: "Climbing", source: "plan" as const }], free: [] },
  ];

  it("builds a heatmap", () => {
    const grid = buildGrid(members, new Date(at(18)), 4);
    expect(grid.map((s) => s.availableCount)).toEqual([2, 2, 3, 3]);
    expect(grid[0]!.members.find((m) => m.userId === "c")).toMatchObject({ status: "busy", reason: "Climbing" });
    expect(grid[0]!.members.find((m) => m.userId === "b")?.status).toBe("free");
  });

  it("suggests the times most people can make", () => {
    const s = suggestTimes(members, {
      from: new Date(at(8)),
      to: new Date(at(23)),
      durationMinutes: 120,
      timeZone: NY,
      earliestHour: 8,
      latestHour: 23,
      limit: 3,
    });
    expect(zonedParts(s[0]!.start, NY).hour).toBe(19);
    expect(s[0]!.availableUserIds).toHaveLength(3);
    expect(s[0]!.preferredUserIds).toEqual(["b"]);
    // Picks don't overlap
    for (let i = 1; i < s.length; i++) expect(s[i]!.start >= s[i - 1]!.end || s[i]!.end <= s[i - 1]!.start).toBe(true);
  });
});

describe("balances", () => {
  it("splits with leftover cents going to the first people", () => {
    expect(splitEqually(1000, ["a", "b", "c"])).toEqual([
      { userId: "a", amountCents: 334 },
      { userId: "b", amountCents: 333 },
      { userId: "c", amountCents: 333 },
    ]);
  });

  it("nets expenses and settlements, then simplifies", () => {
    const net = netBalances(
      [
        { paidById: "a", amountCents: 9000, shares: splitEqually(9000, ["a", "b", "c"]) },
        { paidById: "b", amountCents: 3000, shares: splitEqually(3000, ["a", "b", "c"]) },
      ],
      [{ fromUserId: "c", toUserId: "a", amountCents: 1000 }],
    );
    expect(Object.fromEntries(net)).toEqual({ a: 4000, b: -1000, c: -3000 });
    const t = simplifyDebts(net);
    expect(t).toEqual([
      { fromUserId: "c", toUserId: "a", amountCents: 3000 },
      { fromUserId: "b", toUserId: "a", amountCents: 1000 },
    ]);
    expect([...net.values()].reduce((s, v) => s + v, 0)).toBe(0);
  });
});
