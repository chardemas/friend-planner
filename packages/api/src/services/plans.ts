import { and, asc, eq, gte, inArray } from "drizzle-orm";
import { expenses, planInvitees, plans, rsvps, users, crews, type Db } from "@lowkey/db";
import type { CreatePlanInput, RsvpStatus } from "@lowkey/validators";
import { overlaps } from "../lib/intervals";
import { expandOccurrences, isOccurrence } from "../lib/recurrence";
import { DAY, WEEK } from "../lib/time";
import { badRequest, forbidden, notFound } from "../orpc";
import { loadMemberAvailability, planMayOverlap, rsvpResolver } from "./commitments";
import { assertMember, crewMemberIds, myCrewIds } from "./crews";
import { getTimezone } from "./users";

function counts(statuses: (RsvpStatus | null)[]) {
  return {
    going: statuses.filter((s) => s === "going").length,
    maybe: statuses.filter((s) => s === "maybe").length,
    declined: statuses.filter((s) => s === "declined").length,
    pending: statuses.filter((s) => s === null).length,
  };
}

/** Occurrences of plans in [from, to), across my crews or one crew. */
export async function listOccurrences(
  db: Db,
  userId: string,
  input: { from: Date; to: Date; crewId?: string; onlyMine?: boolean },
) {
  const crewIds = input.crewId ? [(await assertMember(db, input.crewId, userId)).crewId] : await myCrewIds(db, userId);
  if (!crewIds.length) return [];
  const rows = await db
    .select({ plan: plans, crewName: crews.name, crewEmoji: crews.emoji })
    .from(plans)
    .innerJoin(crews, eq(crews.id, plans.crewId))
    .where(and(inArray(plans.crewId, crewIds), planMayOverlap(input.from, input.to)));
  if (!rows.length) return [];
  const planIds = rows.map((r) => r.plan.id);
  const invitees = await db
    .select({ planId: planInvitees.planId, userId: planInvitees.userId, name: users.name, color: users.color })
    .from(planInvitees)
    .innerJoin(users, eq(users.id, planInvitees.userId))
    .where(inArray(planInvitees.planId, planIds));
  const { resolve } = await rsvpResolver(db, planIds, input.from, input.to);

  const out = rows.flatMap(({ plan, crewName, crewEmoji }) => {
    const people = invitees.filter((i) => i.planId === plan.id);
    const invited = people.some((p) => p.userId === userId);
    if (input.onlyMine && !invited) return [];
    return expandOccurrences(plan, input.from, input.to).map((occ) => {
      const statuses = people.map((p) => ({ ...p, status: resolve(plan.id, p.userId, occ.start) }));
      return {
        planId: plan.id,
        crewId: plan.crewId,
        crewName,
        crewEmoji,
        title: plan.title,
        kind: plan.kind,
        location: plan.location,
        repeatsWeekly: plan.repeatsWeekly,
        capacity: plan.capacity,
        start: occ.start,
        end: occ.end,
        invited,
        myStatus: invited ? resolve(plan.id, userId, occ.start) : null,
        counts: counts(statuses.map((s) => s.status)),
        going: statuses.filter((s) => s.status === "going").map(({ userId, name, color }) => ({ userId, name, color })),
      };
    });
  });
  return out.sort((a, b) => a.start.getTime() - b.start.getTime());
}

export async function getPlan(db: Db, userId: string, planId: string) {
  const plan = await db.query.plans.findFirst({
    where: eq(plans.id, planId),
    with: { crew: true, createdBy: { columns: { id: true, name: true } } },
  });
  if (!plan) throw notFound("Plan");
  await assertMember(db, plan.crewId, userId);

  // One-off plans have a single occurrence; weekly plans show the next few (including one happening now).
  const occurrences = plan.repeatsWeekly
    ? expandOccurrences(plan, new Date(Date.now() - DAY), new Date(Date.now() + 6 * WEEK)).slice(0, 6)
    : [{ start: plan.startsAt, end: plan.endsAt }];
  if (!occurrences.length) occurrences.push({ start: plan.startsAt, end: plan.endsAt });

  const invitees = await db
    .select({ userId: users.id, name: users.name, color: users.color, standingStatus: planInvitees.standingStatus })
    .from(planInvitees)
    .innerJoin(users, eq(users.id, planInvitees.userId))
    .where(eq(planInvitees.planId, planId))
    .orderBy(asc(users.name));
  const first = occurrences[0]?.start ?? plan.startsAt;
  const last = occurrences[occurrences.length - 1]?.end ?? plan.endsAt;
  const { resolve } = await rsvpResolver(db, [planId], first, new Date(last.getTime() + 1));

  const planExpenses = await db.query.expenses.findMany({
    where: eq(expenses.planId, planId),
    with: { paidBy: { columns: { id: true, name: true } } },
    orderBy: (e, { desc }) => [desc(e.createdAt)],
  });

  return {
    ...plan,
    isOrganizer: plan.createdById === userId,
    invitees,
    occurrences: occurrences.map((o) => {
      const responses = invitees.map((i) => ({ userId: i.userId, status: resolve(planId, i.userId, o.start) }));
      return { ...o, responses, counts: counts(responses.map((r) => r.status)) };
    }),
    expenses: planExpenses,
  };
}

export async function createPlan(db: Db, userId: string, input: CreatePlanInput) {
  await assertMember(db, input.crewId, userId);
  const members = await crewMemberIds(db, input.crewId);
  const invitees = new Set(input.inviteeIds?.length ? input.inviteeIds : members);
  invitees.add(userId);
  for (const id of invitees) if (!members.includes(id)) throw badRequest("Everyone invited must be in the crew");
  if (input.repeatUntil && input.repeatUntil < input.startsAt) throw badRequest("Repeat end is before the first date");
  const timezone = await getTimezone(db, userId);

  return db.transaction(async (tx) => {
    const [plan] = await tx
      .insert(plans)
      .values({
        crewId: input.crewId,
        title: input.title,
        description: input.description || null,
        location: input.location || null,
        kind: input.kind,
        startsAt: input.startsAt,
        endsAt: input.endsAt,
        repeatsWeekly: input.repeatsWeekly,
        repeatUntil: input.repeatsWeekly ? (input.repeatUntil ?? null) : null,
        timezone,
        capacity: input.capacity ?? null,
        createdById: userId,
      })
      .returning();
    await tx.insert(planInvitees).values(
      [...invitees].map((id) => ({
        planId: plan!.id,
        userId: id,
        // The organizer is in by default (every week, for weekly plans).
        standingStatus: id === userId ? ("going" as const) : null,
      })),
    );
    return plan!;
  });
}

export async function rsvp(
  db: Db,
  userId: string,
  input: { planId: string; occurrenceStart: Date; status: RsvpStatus; scope: "occurrence" | "series" },
) {
  const plan = await db.query.plans.findFirst({ where: eq(plans.id, input.planId) });
  if (!plan || plan.cancelledAt) throw notFound("Plan");
  await assertMember(db, plan.crewId, userId);
  if (!isOccurrence(plan, input.occurrenceStart)) throw badRequest("That date isn't part of this plan");

  if (input.status === "going" && plan.capacity) {
    const invitees = await db.select().from(planInvitees).where(eq(planInvitees.planId, plan.id));
    const { resolve } = await rsvpResolver(db, [plan.id], input.occurrenceStart, new Date(input.occurrenceStart.getTime() + 1));
    const going = invitees.filter((i) => i.userId !== userId && resolve(plan.id, i.userId, input.occurrenceStart) === "going");
    if (going.length >= plan.capacity) throw badRequest(`It's full (${plan.capacity} spots). Say maybe and you'll see if someone drops.`);
  }

  await db.transaction(async (tx) => {
    // Any crew member can jump in; answering adds you to the invite list.
    await tx
      .insert(planInvitees)
      .values({ planId: plan.id, userId, standingStatus: input.scope === "series" ? input.status : null })
      .onConflictDoUpdate({
        target: [planInvitees.planId, planInvitees.userId],
        set: input.scope === "series" ? { standingStatus: input.status } : { userId },
      });
    if (input.scope === "series" && plan.repeatsWeekly) {
      // A new standing answer replaces one-off answers from this occurrence on.
      await tx
        .delete(rsvps)
        .where(and(eq(rsvps.planId, plan.id), eq(rsvps.userId, userId), gte(rsvps.occurrenceStart, input.occurrenceStart)));
    } else {
      await tx
        .insert(rsvps)
        .values({ planId: plan.id, userId, occurrenceStart: input.occurrenceStart, status: input.status })
        .onConflictDoUpdate({
          target: [rsvps.planId, rsvps.userId, rsvps.occurrenceStart],
          set: { status: input.status, updatedAt: new Date() },
        });
    }
  });
  return { ok: true as const };
}

export async function cancelPlan(db: Db, userId: string, planId: string) {
  const plan = await db.query.plans.findFirst({ where: eq(plans.id, planId) });
  if (!plan) throw notFound("Plan");
  if (plan.createdById !== userId) throw forbidden("Only the organizer can cancel this");
  await db.update(plans).set({ cancelledAt: new Date() }).where(eq(plans.id, planId));
  return { ok: true as const };
}

/** Who can't make a proposed time, and why. */
export async function checkConflicts(
  db: Db,
  userId: string,
  input: { crewId: string; startsAt: Date; endsAt: Date; inviteeIds?: string[]; ignorePlanId?: string },
) {
  await assertMember(db, input.crewId, userId);
  const members = await crewMemberIds(db, input.crewId);
  const userIds = input.inviteeIds?.length ? input.inviteeIds.filter((id) => members.includes(id)) : members;
  const availability = await loadMemberAvailability(db, {
    viewerId: userId,
    viewerCrewIds: await myCrewIds(db, userId),
    userIds,
    from: input.startsAt,
    to: input.endsAt,
    ignorePlanId: input.ignorePlanId,
  });
  const window = { start: input.startsAt.getTime(), end: input.endsAt.getTime() };
  return availability.map((m) => {
    const reasons = m.busy.filter((b) => overlaps(b, window)).map((b) => b.label);
    return {
      userId: m.userId,
      name: m.name,
      color: m.color,
      status: reasons.length ? ("busy" as const) : m.free.some((f) => f.start <= window.start && f.end >= window.end) ? ("free" as const) : ("open" as const),
      reasons: [...new Set(reasons)],
    };
  });
}
