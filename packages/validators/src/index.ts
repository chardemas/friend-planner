import { z } from "zod";

/** Shared input contracts. The API validates with these and the web/mobile forms reuse them. */

export const planKinds = ["hang", "sports", "games", "food", "other"] as const;
export const rsvpStatuses = ["going", "maybe", "declined"] as const;
export const availabilityKinds = ["busy", "free"] as const;

export const id = z.string().uuid();
export const isoDateTime = z.coerce.date();

export const createCrewInput = z.object({
  name: z.string().trim().min(1, "Give your crew a name").max(60),
  emoji: z.string().trim().max(8).default("🫶"),
});

export const joinCrewInput = z.object({ inviteCode: z.string().trim().min(4).max(32) });

export const createPlanInput = z
  .object({
    crewId: id,
    title: z.string().trim().min(1, "What's the plan?").max(100),
    description: z.string().trim().max(1000).optional(),
    location: z.string().trim().max(200).optional(),
    kind: z.enum(planKinds).default("hang"),
    startsAt: isoDateTime,
    endsAt: isoDateTime,
    repeatsWeekly: z.boolean().default(false),
    repeatUntil: isoDateTime.optional(),
    capacity: z.number().int().positive().max(500).optional(),
    /** Defaults to the whole crew when omitted. */
    inviteeIds: z.array(id).optional(),
  })
  .refine((p) => p.endsAt > p.startsAt, { message: "End time must be after the start", path: ["endsAt"] });

export const rsvpInput = z.object({
  planId: id,
  /** Which occurrence of a weekly plan this answer is for (the occurrence's start time). */
  occurrenceStart: isoDateTime,
  status: z.enum(rsvpStatuses),
  /** "series" sets a standing answer for every future occurrence of a weekly plan. */
  scope: z.enum(["occurrence", "series"]).default("occurrence"),
});

export const conflictCheckInput = z
  .object({
    crewId: id,
    startsAt: isoDateTime,
    endsAt: isoDateTime,
    inviteeIds: z.array(id).optional(),
    ignorePlanId: id.optional(),
  })
  .refine((p) => p.endsAt > p.startsAt, { message: "End must be after start", path: ["endsAt"] });

const minuteOfDay = z.number().int().min(0).max(24 * 60);

export const weeklyBlockInput = z
  .object({
    dayOfWeek: z.number().int().min(0).max(6),
    startMinute: minuteOfDay,
    endMinute: minuteOfDay,
    label: z.string().trim().max(80).optional(),
  })
  .refine((b) => b.endMinute > b.startMinute, { message: "End must be after start" });

/** Replace your whole recurring weekly pattern in one go (what the paint grid saves). */
export const setWeeklyPatternInput = z.object({
  kind: z.enum(availabilityKinds),
  blocks: z.array(weeklyBlockInput).max(7 * 48),
});

export const oneOffBlockInput = z
  .object({
    kind: z.enum(availabilityKinds),
    label: z.string().trim().max(80).optional(),
    startsAt: isoDateTime,
    endsAt: isoDateTime,
  })
  .refine((b) => b.endsAt > b.startsAt, { message: "End must be after start", path: ["endsAt"] });

export const crewGridInput = z.object({
  crewId: id,
  /** Any instant within the first day to show; the grid covers 7 days from that local midnight. */
  weekStart: isoDateTime,
  days: z.number().int().min(1).max(14).default(7),
});

export const suggestTimesInput = z.object({
  crewId: id,
  from: isoDateTime,
  to: isoDateTime,
  durationMinutes: z.number().int().min(30).max(12 * 60).default(120),
  /** Only consider slots that start between these local hours. */
  earliestHour: z.number().int().min(0).max(23).default(9),
  latestHour: z.number().int().min(1).max(24).default(23),
  limit: z.number().int().min(1).max(20).default(5),
});

export const createExpenseInput = z
  .object({
    crewId: id,
    planId: id.optional(),
    description: z.string().trim().min(1, "What was it for?").max(120),
    amountCents: z.number().int().positive().max(10_000_000),
    paidById: id,
    split: z.discriminatedUnion("method", [
      z.object({ method: z.literal("equal"), userIds: z.array(id).min(1) }),
      z.object({
        method: z.literal("exact"),
        shares: z.array(z.object({ userId: id, amountCents: z.number().int().nonnegative() })).min(1),
      }),
    ]),
  })
  .refine(
    (e) => e.split.method !== "exact" || e.split.shares.reduce((s, x) => s + x.amountCents, 0) === e.amountCents,
    { message: "Shares must add up to the total", path: ["split"] },
  );

const email = z.string().trim().toLowerCase().email("Enter a valid email");
const password = z.string().min(10, "Use at least 10 characters").max(128, "Password must be 128 characters or fewer");
const authCredentials = { email, password };

export const signInInput = z.object(authCredentials);

export const signUpInput = z.object({
  ...authCredentials,
  name: z.string().trim().min(1, "What should friends call you?").max(60),
  timezone: z.string().max(64).optional(),
});

export const forgotPasswordInput = z.object({ email });

export const resetPasswordInput = z.object({ token: z.string().min(1).max(128), password });

export const deleteAccountInput = z.object({
  password: z.string().min(1, "Enter your password").max(128),
  confirm: z.literal("DELETE", { error: 'Type DELETE to confirm' }),
});

export const updateProfileInput = z.object({
  name: z.string().trim().min(1).max(60).optional(),
  timezone: z.string().max(64).optional(),
});

export const settleUpInput = z.object({
  crewId: id,
  toUserId: id,
  amountCents: z.number().int().positive().max(10_000_000),
});

export type CreatePlanInput = z.infer<typeof createPlanInput>;
export type CreateExpenseInput = z.infer<typeof createExpenseInput>;
export type PlanKind = (typeof planKinds)[number];
export type RsvpStatus = (typeof rsvpStatuses)[number];
export type AvailabilityKind = (typeof availabilityKinds)[number];
