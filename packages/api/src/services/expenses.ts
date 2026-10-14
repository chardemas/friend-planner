import { and, desc, eq, inArray } from "drizzle-orm";
import { crewMembers, crews, expenseShares, expenses, plans, settlements, users, type Db } from "@lowkey/db";
import type { CreateExpenseInput } from "@lowkey/validators";
import { netBalances, simplifyDebts, splitEqually } from "../lib/balances";
import { badRequest, forbidden, notFound } from "../orpc";
import { assertMember, crewMemberIds, myCrewIds } from "./crews";

async function loadLedger(db: Db, crewIds: string[]) {
  if (!crewIds.length) return { expenseRows: [], shareRows: [], settlementRows: [] };
  const expenseRows = await db.select().from(expenses).where(inArray(expenses.crewId, crewIds));
  const [shareRows, settlementRows] = await Promise.all([
    expenseRows.length
      ? db.select().from(expenseShares).where(inArray(expenseShares.expenseId, expenseRows.map((e) => e.id)))
      : Promise.resolve([]),
    db.select().from(settlements).where(inArray(settlements.crewId, crewIds)),
  ]);
  return { expenseRows, shareRows, settlementRows };
}

export async function listExpenses(db: Db, userId: string, crewId: string) {
  await assertMember(db, crewId, userId);
  const rows = await db.query.expenses.findMany({
    where: eq(expenses.crewId, crewId),
    with: {
      paidBy: { columns: { id: true, name: true, color: true } },
      shares: { with: { user: { columns: { id: true, name: true } } } },
      plan: { columns: { id: true, title: true } },
    },
    orderBy: [desc(expenses.createdAt)],
    limit: 100,
  });
  const paybacks = await db
    .select()
    .from(settlements)
    .where(eq(settlements.crewId, crewId))
    .orderBy(desc(settlements.createdAt))
    .limit(50);
  return { expenses: rows, settlements: paybacks };
}

export async function createExpense(db: Db, userId: string, input: CreateExpenseInput) {
  await assertMember(db, input.crewId, userId);
  const members = await crewMemberIds(db, input.crewId);
  const shares =
    input.split.method === "equal"
      ? splitEqually(input.amountCents, input.split.userIds)
      : input.split.shares.filter((s) => s.amountCents > 0);
  if (!shares.length) throw badRequest("Split it with at least one person");
  for (const id of [input.paidById, ...shares.map((s) => s.userId)])
    if (!members.includes(id)) throw badRequest("Everyone on an expense must be in the crew");
  if (input.planId) {
    const plan = await db.query.plans.findFirst({ where: and(eq(plans.id, input.planId), eq(plans.crewId, input.crewId)) });
    if (!plan) throw notFound("Plan");
  }
  return db.transaction(async (tx) => {
    const [expense] = await tx
      .insert(expenses)
      .values({
        crewId: input.crewId,
        planId: input.planId ?? null,
        description: input.description,
        amountCents: input.amountCents,
        paidById: input.paidById,
        createdById: userId,
        splitMethod: input.split.method,
      })
      .returning();
    await tx.insert(expenseShares).values(shares.map((s) => ({ ...s, expenseId: expense!.id })));
    return expense!;
  });
}

export async function deleteExpense(db: Db, userId: string, expenseId: string) {
  const e = await db.query.expenses.findFirst({ where: eq(expenses.id, expenseId) });
  if (!e) throw notFound("Expense");
  await assertMember(db, e.crewId, userId);
  if (e.createdById !== userId && e.paidById !== userId) throw forbidden("Only whoever added or paid this can delete it");
  await db.delete(expenses).where(eq(expenses.id, expenseId));
  return { ok: true as const };
}

export async function crewBalances(db: Db, userId: string, crewId: string) {
  await assertMember(db, crewId, userId);
  const { expenseRows, shareRows, settlementRows } = await loadLedger(db, [crewId]);
  const net = netBalances(
    expenseRows.map((e) => ({ ...e, shares: shareRows.filter((s) => s.expenseId === e.id) })),
    settlementRows,
  );
  const people = await db
    .select({ id: users.id, name: users.name, color: users.color })
    .from(crewMembers)
    .innerJoin(users, eq(users.id, crewMembers.userId))
    .where(eq(crewMembers.crewId, crewId));
  // Include ex-members who still have a balance.
  const missing = [...net.keys()].filter((id) => !people.some((p) => p.id === id));
  if (missing.length)
    people.push(...(await db.select({ id: users.id, name: users.name, color: users.color }).from(users).where(inArray(users.id, missing))));
  return {
    members: people.map((p) => ({ ...p, netCents: net.get(p.id) ?? 0 })).sort((a, b) => b.netCents - a.netCents),
    transfers: simplifyDebts(net),
    totalSpentCents: expenseRows.reduce((s, e) => s + e.amountCents, 0),
  };
}

export async function settleUp(db: Db, userId: string, input: { crewId: string; toUserId: string; amountCents: number }) {
  await assertMember(db, input.crewId, userId);
  if (input.toUserId === userId) throw badRequest("You can't pay yourself back");
  const [s] = await db
    .insert(settlements)
    .values({ crewId: input.crewId, fromUserId: userId, toUserId: input.toUserId, amountCents: input.amountCents })
    .returning();
  return s!;
}

/** My net position in each crew, for the home screen. */
export async function mySummary(db: Db, userId: string) {
  const crewIds = await myCrewIds(db, userId);
  const { expenseRows, shareRows, settlementRows } = await loadLedger(db, crewIds);
  const crewRows = crewIds.length ? await db.select().from(crews).where(inArray(crews.id, crewIds)) : [];
  return crewRows
    .map((c) => {
      const exp = expenseRows.filter((e) => e.crewId === c.id);
      const net = netBalances(
        exp.map((e) => ({ ...e, shares: shareRows.filter((s) => s.expenseId === e.id) })),
        settlementRows.filter((s) => s.crewId === c.id),
      );
      return { crewId: c.id, crewName: c.name, crewEmoji: c.emoji, netCents: net.get(userId) ?? 0 };
    })
    .filter((c) => c.netCents !== 0);
}
