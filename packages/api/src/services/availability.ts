import { and, asc, eq, isNotNull, isNull } from "drizzle-orm";
import { availabilityBlocks, type Db } from "@lowkey/db";
import type { AvailabilityKind } from "@lowkey/validators";
import { buildGrid, suggestTimes, type WeeklyBlock } from "../lib/availability";
import { MINUTE, addZonedDays, startOfZonedDay } from "../lib/time";
import { badRequest, notFound } from "../orpc";
import { loadMemberAvailability } from "./commitments";
import { assertMember, crewMemberIds, myCrewIds } from "./crews";
import { getTimezone } from "./users";

export async function myBlocks(db: Db, userId: string) {
  const [blocks, timezone] = await Promise.all([
    db
      .select()
      .from(availabilityBlocks)
      .where(eq(availabilityBlocks.userId, userId))
      .orderBy(asc(availabilityBlocks.dayOfWeek), asc(availabilityBlocks.startMinute), asc(availabilityBlocks.startsAt)),
    getTimezone(db, userId),
  ]);
  return {
    timezone,
    weekly: blocks.filter((b) => b.dayOfWeek !== null),
    oneOff: blocks.filter((b) => b.startsAt !== null && (b.endsAt?.getTime() ?? 0) > Date.now()),
  };
}

/** Replace the user's recurring busy (or free) pattern. */
export async function setWeeklyPattern(db: Db, userId: string, input: { kind: AvailabilityKind; blocks: WeeklyBlock[] }) {
  await db.transaction(async (tx) => {
    await tx
      .delete(availabilityBlocks)
      .where(and(eq(availabilityBlocks.userId, userId), eq(availabilityBlocks.kind, input.kind), isNotNull(availabilityBlocks.dayOfWeek)));
    if (input.blocks.length)
      await tx.insert(availabilityBlocks).values(input.blocks.map((b) => ({ ...b, userId, kind: input.kind })));
  });
  return { ok: true as const };
}

export async function addOneOff(
  db: Db,
  userId: string,
  input: { kind: AvailabilityKind; label?: string; startsAt: Date; endsAt: Date },
) {
  if (input.endsAt.getTime() - input.startsAt.getTime() > 31 * 24 * 60 * MINUTE) throw badRequest("Keep it under a month");
  const [b] = await db
    .insert(availabilityBlocks)
    .values({ userId, kind: input.kind, label: input.label || null, startsAt: input.startsAt, endsAt: input.endsAt })
    .returning();
  return b!;
}

export async function deleteBlock(db: Db, userId: string, id: string) {
  const res = await db
    .delete(availabilityBlocks)
    .where(and(eq(availabilityBlocks.id, id), eq(availabilityBlocks.userId, userId), isNull(availabilityBlocks.dayOfWeek)))
    .returning({ id: availabilityBlocks.id });
  if (!res.length) throw notFound("Block");
  return { ok: true as const };
}

async function crewContext(db: Db, userId: string, crewId: string) {
  await assertMember(db, crewId, userId);
  const [userIds, viewerCrewIds, timezone] = await Promise.all([
    crewMemberIds(db, crewId),
    myCrewIds(db, userId),
    getTimezone(db, userId),
  ]);
  return { userIds, viewerCrewIds, timezone };
}

/** Half-hour heatmap of who's free, shown in the viewer's time zone. */
export async function crewGrid(db: Db, userId: string, input: { crewId: string; weekStart: Date; days: number }) {
  const { userIds, viewerCrewIds, timezone } = await crewContext(db, userId, input.crewId);
  const from = startOfZonedDay(input.weekStart, timezone);
  const to = addZonedDays(from, input.days, timezone);
  const members = await loadMemberAvailability(db, { viewerId: userId, viewerCrewIds, userIds, from, to });
  const slotCount = Math.round((to.getTime() - from.getTime()) / (30 * MINUTE));
  const slots = buildGrid(members, from, slotCount);
  return {
    timezone,
    from,
    to,
    members: members.map(({ userId, name, color }) => ({ userId, name, color })),
    slots: slots.map((s) => ({
      start: s.start,
      availableCount: s.availableCount,
      free: s.members.filter((m) => m.status === "free").map((m) => m.userId),
      busy: s.members.filter((m) => m.status === "busy").map((m) => ({ userId: m.userId, reason: m.reason ?? "Busy" })),
    })),
  };
}

export async function suggest(
  db: Db,
  userId: string,
  input: { crewId: string; from: Date; to: Date; durationMinutes: number; earliestHour: number; latestHour: number; limit: number },
) {
  const { userIds, viewerCrewIds, timezone } = await crewContext(db, userId, input.crewId);
  if (input.to.getTime() - input.from.getTime() > 31 * 24 * 60 * MINUTE) throw badRequest("Search at most a month at a time");
  const members = await loadMemberAvailability(db, { viewerId: userId, viewerCrewIds, userIds, from: input.from, to: input.to });
  const names = new Map(members.map((m) => [m.userId, m.name]));
  return {
    memberCount: members.length,
    suggestions: suggestTimes(members, { ...input, timeZone: timezone, now: new Date() }).map((s) => ({
      ...s,
      unavailable: s.unavailable.map((u) => ({ ...u, name: names.get(u.userId) ?? "Someone" })),
    })),
  };
}
