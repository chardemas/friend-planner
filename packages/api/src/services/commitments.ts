import { and, eq, gt, inArray, isNull, lt, or, gte } from "drizzle-orm";
import { availabilityBlocks, planInvitees, plans, rsvps, users, type DbOrTx } from "@lowkey/db";
import { expandBlocks, type MemberAvailability, type Reason } from "../lib/availability";
import { expandOccurrences } from "../lib/recurrence";
import type { RsvpStatus } from "@lowkey/validators";

/** Plans that might have an occurrence overlapping [from, to). */
export const planMayOverlap = (from: Date, to: Date) =>
  and(
    isNull(plans.cancelledAt),
    lt(plans.startsAt, to),
    or(
      gt(plans.endsAt, from),
      and(eq(plans.repeatsWeekly, true), or(isNull(plans.repeatUntil), gte(plans.repeatUntil, from))),
    ),
  );

const key = (planId: string, userId: string, start: Date) => `${planId}|${userId}|${start.getTime()}`;

/** Look up explicit RSVPs and fall back to the invitee's standing answer. */
export async function rsvpResolver(db: DbOrTx, planIds: string[], from: Date, to: Date) {
  if (!planIds.length) return { resolve: () => null as RsvpStatus | null };
  const [explicit, invitees] = await Promise.all([
    db
      .select()
      .from(rsvps)
      .where(and(inArray(rsvps.planId, planIds), gte(rsvps.occurrenceStart, new Date(from.getTime() - 7 * 864e5)), lt(rsvps.occurrenceStart, to))),
    db.select().from(planInvitees).where(inArray(planInvitees.planId, planIds)),
  ]);
  const map = new Map(explicit.map((r) => [key(r.planId, r.userId, r.occurrenceStart), r.status]));
  const standing = new Map(invitees.map((i) => [`${i.planId}|${i.userId}`, i.standingStatus]));
  return {
    resolve: (planId: string, userId: string, start: Date): RsvpStatus | null =>
      map.get(key(planId, userId, start)) ?? standing.get(`${planId}|${userId}`) ?? null,
  };
}

/**
 * Everyone's busy/free intervals for [from, to): their availability blocks plus plans they're going to.
 * Personal block labels and plans in crews the viewer isn't in are hidden.
 */
export async function loadMemberAvailability(
  db: DbOrTx,
  opts: { viewerId: string; viewerCrewIds: string[]; userIds: string[]; from: Date; to: Date; ignorePlanId?: string },
): Promise<(MemberAvailability & { name: string; color: string })[]> {
  const { userIds, from, to } = opts;
  if (!userIds.length) return [];
  const [people, blocks, invites] = await Promise.all([
    db.select({ id: users.id, name: users.name, color: users.color, timezone: users.timezone }).from(users).where(inArray(users.id, userIds)),
    db.select().from(availabilityBlocks).where(inArray(availabilityBlocks.userId, userIds)),
    db
      .select({ userId: planInvitees.userId, plan: plans })
      .from(planInvitees)
      .innerJoin(plans, eq(plans.id, planInvitees.planId))
      .where(and(inArray(planInvitees.userId, userIds), planMayOverlap(from, to))),
  ]);
  const planIds = [...new Set(invites.map((i) => i.plan.id))];
  const { resolve } = await rsvpResolver(db, planIds, from, to);

  return userIds.flatMap((userId) => {
    const person = people.find((p) => p.id === userId);
    if (!person) return [];
    const mine = blocks.filter((b) => b.userId === userId);
    const { busy, free } = expandBlocks(mine, person.timezone, from, to);
    const isViewer = userId === opts.viewerId;
    const busyReasons: Reason[] = busy.map((b) => ({ ...b, label: isViewer ? b.label : "Busy" }));
    for (const { plan } of invites.filter((i) => i.userId === userId)) {
      if (plan.id === opts.ignorePlanId) continue;
      for (const occ of expandOccurrences(plan, from, to)) {
        if (resolve(plan.id, userId, occ.start) !== "going") continue;
        const visible = opts.viewerCrewIds.includes(plan.crewId);
        busyReasons.push({
          start: occ.start.getTime(),
          end: occ.end.getTime(),
          label: visible ? plan.title : "Has plans",
          source: "plan",
        });
      }
    }
    return [{ userId, name: person.name, color: person.color, busy: busyReasons, free }];
  });
}
