/** All money is integer cents. */

/** Split `amountCents` as evenly as possible; leftover cents go to the first people listed. */
export function splitEqually(amountCents: number, userIds: string[]) {
  const unique = [...new Set(userIds)];
  if (!unique.length) throw new Error("Need at least one person to split with");
  const base = Math.floor(amountCents / unique.length);
  const remainder = amountCents - base * unique.length;
  return unique.map((userId, i) => ({ userId, amountCents: base + (i < remainder ? 1 : 0) }));
}

export interface ExpenseLike {
  paidById: string;
  amountCents: number;
  shares: { userId: string; amountCents: number }[];
}
export interface SettlementLike {
  fromUserId: string;
  toUserId: string;
  amountCents: number;
}

/** Net position per person: positive = the crew owes them, negative = they owe. */
export function netBalances(expenses: ExpenseLike[], settlements: SettlementLike[]) {
  const net = new Map<string, number>();
  const add = (id: string, cents: number) => net.set(id, (net.get(id) ?? 0) + cents);
  for (const e of expenses) {
    add(e.paidById, e.amountCents);
    for (const s of e.shares) add(s.userId, -s.amountCents);
  }
  for (const s of settlements) {
    add(s.fromUserId, s.amountCents);
    add(s.toUserId, -s.amountCents);
  }
  return net;
}

export interface Transfer {
  fromUserId: string;
  toUserId: string;
  amountCents: number;
}

/**
 * Turn net balances into a short list of "A pays B" transfers
 * (greedy: biggest debtor pays biggest creditor). At most n-1 transfers.
 */
export function simplifyDebts(net: Map<string, number>): Transfer[] {
  const debtors = [...net].filter(([, v]) => v < 0).map(([id, v]) => ({ id, amt: -v }));
  const creditors = [...net].filter(([, v]) => v > 0).map(([id, v]) => ({ id, amt: v }));
  const byAmount = (a: { id: string; amt: number }, b: { id: string; amt: number }) => b.amt - a.amt || a.id.localeCompare(b.id);
  const transfers: Transfer[] = [];
  debtors.sort(byAmount);
  creditors.sort(byAmount);
  while (debtors.length && creditors.length) {
    const d = debtors[0]!;
    const c = creditors[0]!;
    const amt = Math.min(d.amt, c.amt);
    transfers.push({ fromUserId: d.id, toUserId: c.id, amountCents: amt });
    d.amt -= amt;
    c.amt -= amt;
    if (d.amt === 0) debtors.shift();
    if (c.amt === 0) creditors.shift();
    debtors.sort(byAmount);
    creditors.sort(byAmount);
  }
  return transfers;
}
