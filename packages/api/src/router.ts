import { z } from "zod";
import {
  conflictCheckInput,
  createCrewInput,
  createExpenseInput,
  createPlanInput,
  crewGridInput,
  id,
  isoDateTime,
  joinCrewInput,
  oneOffBlockInput,
  rsvpInput,
  setWeeklyPatternInput,
  settleUpInput,
  suggestTimesInput,
  updateProfileInput,
} from "@lowkey/validators";
import { authed, pub } from "./orpc";
import * as availability from "./services/availability";
import * as crews from "./services/crews";
import * as expenses from "./services/expenses";
import * as plans from "./services/plans";
import * as users from "./services/users";

/**
 * Thin transport layer: validate input, call a service. Business rules live in ./services.
 */
export const router = {
  me: {
    get: pub.handler(({ context }) => (context.userId ? users.me(context.db, context.userId) : null)),
    update: authed.input(updateProfileInput).handler(({ context, input }) => users.updateProfile(context.db, context.userId, input)),
  },

  crews: {
    list: authed.handler(({ context }) => crews.listCrews(context.db, context.userId)),
    get: authed.input(z.object({ crewId: id })).handler(({ context, input }) => crews.getCrew(context.db, context.userId, input.crewId)),
    create: authed.input(createCrewInput).handler(({ context, input }) => crews.createCrew(context.db, context.userId, input)),
    previewInvite: pub.input(joinCrewInput).handler(({ context, input }) => crews.previewInvite(context.db, input.inviteCode)),
    join: authed.input(joinCrewInput).handler(({ context, input }) => crews.joinCrew(context.db, context.userId, input.inviteCode)),
    leave: authed.input(z.object({ crewId: id })).handler(({ context, input }) => crews.leaveCrew(context.db, context.userId, input.crewId)),
    resetInvite: authed
      .input(z.object({ crewId: id }))
      .handler(({ context, input }) => crews.resetInviteCode(context.db, context.userId, input.crewId)),
  },

  plans: {
    occurrences: authed
      .input(z.object({ from: isoDateTime, to: isoDateTime, crewId: id.optional(), onlyMine: z.boolean().optional() }))
      .handler(({ context, input }) => plans.listOccurrences(context.db, context.userId, input)),
    get: authed.input(z.object({ planId: id })).handler(({ context, input }) => plans.getPlan(context.db, context.userId, input.planId)),
    create: authed.input(createPlanInput).handler(({ context, input }) => plans.createPlan(context.db, context.userId, input)),
    rsvp: authed.input(rsvpInput).handler(({ context, input }) => plans.rsvp(context.db, context.userId, input)),
    cancel: authed.input(z.object({ planId: id })).handler(({ context, input }) => plans.cancelPlan(context.db, context.userId, input.planId)),
    conflicts: authed.input(conflictCheckInput).handler(({ context, input }) => plans.checkConflicts(context.db, context.userId, input)),
  },

  availability: {
    mine: authed.handler(({ context }) => availability.myBlocks(context.db, context.userId)),
    setWeekly: authed
      .input(setWeeklyPatternInput)
      .handler(({ context, input }) => availability.setWeeklyPattern(context.db, context.userId, input)),
    addOneOff: authed.input(oneOffBlockInput).handler(({ context, input }) => availability.addOneOff(context.db, context.userId, input)),
    remove: authed.input(z.object({ blockId: id })).handler(({ context, input }) => availability.deleteBlock(context.db, context.userId, input.blockId)),
    crewGrid: authed.input(crewGridInput).handler(({ context, input }) => availability.crewGrid(context.db, context.userId, input)),
    suggest: authed.input(suggestTimesInput).handler(({ context, input }) => availability.suggest(context.db, context.userId, input)),
  },

  expenses: {
    list: authed.input(z.object({ crewId: id })).handler(({ context, input }) => expenses.listExpenses(context.db, context.userId, input.crewId)),
    create: authed.input(createExpenseInput).handler(({ context, input }) => expenses.createExpense(context.db, context.userId, input)),
    remove: authed
      .input(z.object({ expenseId: id }))
      .handler(({ context, input }) => expenses.deleteExpense(context.db, context.userId, input.expenseId)),
    balances: authed
      .input(z.object({ crewId: id }))
      .handler(({ context, input }) => expenses.crewBalances(context.db, context.userId, input.crewId)),
    settleUp: authed.input(settleUpInput).handler(({ context, input }) => expenses.settleUp(context.db, context.userId, input)),
    mySummary: authed.handler(({ context }) => expenses.mySummary(context.db, context.userId)),
  },
};

export type AppRouter = typeof router;
