import { relations, sql } from "drizzle-orm";
import {
  boolean,
  check,
  index,
  integer,
  pgEnum,
  pgTable,
  primaryKey,
  smallint,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

const timestamps = {
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
};

export const planKind = pgEnum("plan_kind", ["hang", "sports", "games", "food", "other"]);
export const rsvpStatus = pgEnum("rsvp_status", ["going", "maybe", "declined"]);
export const crewRole = pgEnum("crew_role", ["owner", "member"]);
export const availabilityKind = pgEnum("availability_kind", ["busy", "free"]);
export const splitMethod = pgEnum("split_method", ["equal", "exact"]);

export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  email: text("email").notNull(),
  /** IANA zone; weekly availability is stored in this zone's wall-clock time. */
  timezone: text("timezone").notNull().default("America/New_York"),
  color: text("color").notNull().default("#7c5cff"),
  ...timestamps,
}, (t) => [uniqueIndex("users_email_idx").on(sql`lower(${t.email})`)]);

export const crews = pgTable("crews", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  emoji: text("emoji").notNull().default("🫶"),
  inviteCode: text("invite_code").notNull().unique(),
  createdById: uuid("created_by_id").notNull().references(() => users.id),
  ...timestamps,
});

export const crewMembers = pgTable("crew_members", {
  crewId: uuid("crew_id").notNull().references(() => crews.id, { onDelete: "cascade" }),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  role: crewRole("role").notNull().default("member"),
  joinedAt: timestamp("joined_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [primaryKey({ columns: [t.crewId, t.userId] }), index("crew_members_user_idx").on(t.userId)]);

export const plans = pgTable("plans", {
  id: uuid("id").primaryKey().defaultRandom(),
  crewId: uuid("crew_id").notNull().references(() => crews.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  description: text("description"),
  location: text("location"),
  kind: planKind("kind").notNull().default("hang"),
  /** First (or only) occurrence. Weekly plans repeat at the same wall-clock time in the creator's zone. */
  startsAt: timestamp("starts_at", { withTimezone: true }).notNull(),
  endsAt: timestamp("ends_at", { withTimezone: true }).notNull(),
  repeatsWeekly: boolean("repeats_weekly").notNull().default(false),
  repeatUntil: timestamp("repeat_until", { withTimezone: true }),
  timezone: text("timezone").notNull().default("America/New_York"),
  capacity: integer("capacity"),
  createdById: uuid("created_by_id").notNull().references(() => users.id),
  cancelledAt: timestamp("cancelled_at", { withTimezone: true }),
  ...timestamps,
}, (t) => [
  index("plans_crew_starts_idx").on(t.crewId, t.startsAt),
  check("plans_time_order", sql`${t.endsAt} > ${t.startsAt}`),
]);

export const planInvitees = pgTable("plan_invitees", {
  planId: uuid("plan_id").notNull().references(() => plans.id, { onDelete: "cascade" }),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  /** "I'm in every week" for recurring plans; per-occurrence RSVPs override it. */
  standingStatus: rsvpStatus("standing_status"),
}, (t) => [primaryKey({ columns: [t.planId, t.userId] }), index("plan_invitees_user_idx").on(t.userId)]);

/** One answer per person per occurrence, so "in for volleyball this week?" works for weekly plans. */
export const rsvps = pgTable("rsvps", {
  planId: uuid("plan_id").notNull().references(() => plans.id, { onDelete: "cascade" }),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  occurrenceStart: timestamp("occurrence_start", { withTimezone: true }).notNull(),
  status: rsvpStatus("status").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [primaryKey({ columns: [t.planId, t.userId, t.occurrenceStart] }), index("rsvps_user_idx").on(t.userId)]);

/**
 * A busy/free block. Either weekly (dayOfWeek + minutes, in the user's timezone)
 * or one-off (startsAt/endsAt instants).
 */
export const availabilityBlocks = pgTable("availability_blocks", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  kind: availabilityKind("kind").notNull(),
  label: text("label"),
  dayOfWeek: smallint("day_of_week"),
  startMinute: smallint("start_minute"),
  endMinute: smallint("end_minute"),
  startsAt: timestamp("starts_at", { withTimezone: true }),
  endsAt: timestamp("ends_at", { withTimezone: true }),
  ...timestamps,
}, (t) => [
  index("availability_user_idx").on(t.userId),
  check(
    "availability_shape",
    sql`(${t.dayOfWeek} is not null and ${t.startMinute} is not null and ${t.endMinute} is not null and ${t.endMinute} > ${t.startMinute} and ${t.startsAt} is null)
     or (${t.dayOfWeek} is null and ${t.startsAt} is not null and ${t.endsAt} is not null and ${t.endsAt} > ${t.startsAt})`,
  ),
]);

export const expenses = pgTable("expenses", {
  id: uuid("id").primaryKey().defaultRandom(),
  crewId: uuid("crew_id").notNull().references(() => crews.id, { onDelete: "cascade" }),
  planId: uuid("plan_id").references(() => plans.id, { onDelete: "set null" }),
  description: text("description").notNull(),
  amountCents: integer("amount_cents").notNull(),
  paidById: uuid("paid_by_id").notNull().references(() => users.id),
  createdById: uuid("created_by_id").notNull().references(() => users.id),
  splitMethod: splitMethod("split_method").notNull(),
  ...timestamps,
}, (t) => [index("expenses_crew_idx").on(t.crewId), check("expenses_positive", sql`${t.amountCents} > 0`)]);

export const expenseShares = pgTable("expense_shares", {
  expenseId: uuid("expense_id").notNull().references(() => expenses.id, { onDelete: "cascade" }),
  userId: uuid("user_id").notNull().references(() => users.id),
  amountCents: integer("amount_cents").notNull(),
}, (t) => [primaryKey({ columns: [t.expenseId, t.userId] })]);

/** "I paid you back" records; they offset expense balances. */
export const settlements = pgTable("settlements", {
  id: uuid("id").primaryKey().defaultRandom(),
  crewId: uuid("crew_id").notNull().references(() => crews.id, { onDelete: "cascade" }),
  fromUserId: uuid("from_user_id").notNull().references(() => users.id),
  toUserId: uuid("to_user_id").notNull().references(() => users.id),
  amountCents: integer("amount_cents").notNull(),
  ...timestamps,
}, (t) => [index("settlements_crew_idx").on(t.crewId), check("settlements_positive", sql`${t.amountCents} > 0`)]);

export const usersRelations = relations(users, ({ many }) => ({ memberships: many(crewMembers) }));
export const crewsRelations = relations(crews, ({ many }) => ({ members: many(crewMembers), plans: many(plans) }));
export const crewMembersRelations = relations(crewMembers, ({ one }) => ({
  crew: one(crews, { fields: [crewMembers.crewId], references: [crews.id] }),
  user: one(users, { fields: [crewMembers.userId], references: [users.id] }),
}));
export const plansRelations = relations(plans, ({ one, many }) => ({
  crew: one(crews, { fields: [plans.crewId], references: [crews.id] }),
  createdBy: one(users, { fields: [plans.createdById], references: [users.id] }),
  invitees: many(planInvitees),
  rsvps: many(rsvps),
}));
export const planInviteesRelations = relations(planInvitees, ({ one }) => ({
  plan: one(plans, { fields: [planInvitees.planId], references: [plans.id] }),
  user: one(users, { fields: [planInvitees.userId], references: [users.id] }),
}));
export const rsvpsRelations = relations(rsvps, ({ one }) => ({
  plan: one(plans, { fields: [rsvps.planId], references: [plans.id] }),
  user: one(users, { fields: [rsvps.userId], references: [users.id] }),
}));
export const expensesRelations = relations(expenses, ({ one, many }) => ({
  shares: many(expenseShares),
  paidBy: one(users, { fields: [expenses.paidById], references: [users.id] }),
  plan: one(plans, { fields: [expenses.planId], references: [plans.id] }),
}));
export const expenseSharesRelations = relations(expenseShares, ({ one }) => ({
  expense: one(expenses, { fields: [expenseShares.expenseId], references: [expenses.id] }),
  user: one(users, { fields: [expenseShares.userId], references: [users.id] }),
}));
