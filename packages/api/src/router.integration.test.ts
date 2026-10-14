/**
 * Runs the real router + services against Postgres (DATABASE_URL). Skipped when no database is configured.
 * Uses fresh random users so it can share a dev database.
 */
import { createRouterClient } from "@orpc/server";
import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { addZonedDays, startOfZonedDay, zonedParts, zonedToUtc } from "./lib/time";

const hasDb = !!process.env.DATABASE_URL;
const TZ = "America/New_York";

describe.skipIf(!hasDb)("router (integration)", async () => {
  const { db } = await import("@lowkey/db");
  const { router } = await import("./router");
  const { signIn } = await import("./services/users");

  const tag = randomUUID().slice(0, 8);
  const mk = async (name: string) => (await signIn(db, { email: `${name}-${tag}@test.dev`, name, timezone: TZ })).user!;
  const as = (userId: string) => createRouterClient(router, { context: { db, userId } });
  const day = (offset: number, hour: number) => {
    const p = zonedParts(addZonedDays(startOfZonedDay(new Date(), TZ), offset, TZ), TZ);
    return zonedToUtc(p.year, p.month, p.day, hour * 60, TZ);
  };

  it("runs the whole flow: crew → plan → RSVP → availability → expenses", async () => {
    const [a, b, c] = [await mk("ann"), await mk("ben"), await mk("cat")];
    const crew = await as(a.id).crews.create({ name: "Test crew", emoji: "🧪" });
    await as(b.id).crews.join({ inviteCode: crew.inviteCode });
    await as(c.id).crews.join({ inviteCode: crew.inviteCode.toUpperCase() });
    expect((await as(c.id).crews.get({ crewId: crew.id })).members).toHaveLength(3);

    // Outsiders can't see it
    const outsider = await mk("out");
    await expect(as(outsider.id).crews.get({ crewId: crew.id })).rejects.toThrow(/not found/i);

    // Weekly plan, capacity 2 (organizer is in by default)
    const start = day(1, 19);
    const plan = await as(a.id).plans.create({
      crewId: crew.id,
      title: "Pickup soccer",
      kind: "sports",
      startsAt: start,
      endsAt: day(1, 21),
      repeatsWeekly: true,
      capacity: 2,
    });
    await as(b.id).plans.rsvp({ planId: plan.id, occurrenceStart: start, status: "going", scope: "series" });
    await expect(as(c.id).plans.rsvp({ planId: plan.id, occurrenceStart: start, status: "going" })).rejects.toThrow(/full/i);
    await as(c.id).plans.rsvp({ planId: plan.id, occurrenceStart: start, status: "maybe" });
    // Ben skips week 2 only
    const week2 = addZonedDays(start, 7, TZ);
    await as(b.id).plans.rsvp({ planId: plan.id, occurrenceStart: week2, status: "declined" });
    await expect(
      as(b.id).plans.rsvp({ planId: plan.id, occurrenceStart: new Date(start.getTime() + 3600_000), status: "going" }),
    ).rejects.toThrow(/isn't part/);

    const detail = await as(c.id).plans.get({ planId: plan.id });
    expect(detail.occurrences[0]!.counts).toMatchObject({ going: 2, maybe: 1 });
    expect(detail.occurrences[1]!.counts).toMatchObject({ going: 1, declined: 1 });

    const occ = await as(a.id).plans.occurrences({ from: day(0, 0), to: day(15, 0), crewId: crew.id });
    expect(occ.filter((o) => o.planId === plan.id)).toHaveLength(2);

    // Availability: Cat is busy Wednesday evenings every week; Ben marks a one-off free window
    const wed = zonedParts(day(2, 12), TZ).weekday;
    await as(c.id).availability.setWeekly({ kind: "busy", blocks: [{ dayOfWeek: wed, startMinute: 18 * 60, endMinute: 22 * 60 }] });
    await as(b.id).availability.addOneOff({ kind: "free", startsAt: day(2, 17), endsAt: day(2, 23) });

    const conflicts = await as(a.id).plans.conflicts({ crewId: crew.id, startsAt: day(2, 19), endsAt: day(2, 21) });
    expect(conflicts.find((x) => x.userId === c.id)).toMatchObject({ status: "busy", reasons: ["Busy"] }); // label hidden from others
    expect(conflicts.find((x) => x.userId === b.id)?.status).toBe("free");

    // Going to soccer makes Ann and Ben busy then
    const soccer = await as(c.id).plans.conflicts({ crewId: crew.id, startsAt: day(1, 19), endsAt: day(1, 20) });
    expect(soccer.find((x) => x.userId === a.id)).toMatchObject({ status: "busy", reasons: ["Pickup soccer"] });

    const grid = await as(a.id).availability.crewGrid({ crewId: crew.id, weekStart: day(2, 0), days: 1 });
    expect(grid.slots).toHaveLength(48);
    const sevenPm = grid.slots[38]!;
    expect(sevenPm.busy.map((x) => x.userId)).toEqual([c.id]);
    expect(sevenPm.free).toEqual([b.id]);

    const sugg = await as(a.id).availability.suggest({
      crewId: crew.id,
      from: day(2, 0),
      to: day(3, 0),
      durationMinutes: 120,
      earliestHour: 15,
      latestHour: 23,
      limit: 3,
    });
    expect(sugg.suggestions[0]!.availableUserIds).toHaveLength(3);
    expect(zonedParts(sugg.suggestions[0]!.start, TZ).hour).toBeLessThan(18);

    // Money: Ann pays $100 dinner split 3 ways, Ben pays $30 split with Cat by exact amounts
    await as(a.id).expenses.create({
      crewId: crew.id,
      planId: plan.id,
      description: "Dinner",
      amountCents: 10000,
      paidById: a.id,
      split: { method: "equal", userIds: [a.id, b.id, c.id] },
    });
    await as(b.id).expenses.create({
      crewId: crew.id,
      description: "Cab",
      amountCents: 3000,
      paidById: b.id,
      split: { method: "exact", shares: [{ userId: b.id, amountCents: 1000 }, { userId: c.id, amountCents: 2000 }] },
    });
    await expect(
      as(b.id).expenses.create({
        crewId: crew.id,
        description: "Bad",
        amountCents: 3000,
        paidById: b.id,
        split: { method: "exact", shares: [{ userId: b.id, amountCents: 1000 }] },
      }),
    ).rejects.toThrow();

    let bal = await as(a.id).expenses.balances({ crewId: crew.id });
    const net = Object.fromEntries(bal.members.map((m) => [m.id, m.netCents]));
    expect(net).toEqual({ [a.id]: 6666, [b.id]: -1333, [c.id]: -5333 });
    expect(bal.transfers.reduce((s, t) => s + t.amountCents, 0)).toBe(6666);

    await as(c.id).expenses.settleUp({ crewId: crew.id, toUserId: a.id, amountCents: 5333 });
    bal = await as(a.id).expenses.balances({ crewId: crew.id });
    expect(bal.transfers).toEqual([{ fromUserId: b.id, toUserId: a.id, amountCents: 1333 }]);

    const summary = await as(b.id).expenses.mySummary();
    expect(summary.find((s) => s.crewId === crew.id)?.netCents).toBe(-1333);

    // Only the organizer can cancel
    await expect(as(b.id).plans.cancel({ planId: plan.id })).rejects.toThrow(/organizer/);
    await as(a.id).plans.cancel({ planId: plan.id });
    expect((await as(a.id).plans.occurrences({ from: day(0, 0), to: day(15, 0), crewId: crew.id })).length).toBe(0);
  });
});
