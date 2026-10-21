"use client";

import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { orpc } from "@/lib/orpc";
import { money, parseMoney } from "@/lib/format";
import { Avatar } from "./avatar";

type Member = { id: string; name: string; color: string };

export function useInvalidateMoney() {
  const qc = useQueryClient();
  return () => {
    qc.invalidateQueries({ queryKey: orpc.expenses.key() });
    qc.invalidateQueries({ queryKey: orpc.plans.key() });
  };
}

export function ExpenseForm({
  crewId,
  members,
  meId,
  planId,
  defaultSplitIds,
  onDone,
}: {
  crewId: string;
  members: Member[];
  meId: string;
  planId?: string;
  defaultSplitIds?: string[];
  onDone?: () => void;
}) {
  const invalidate = useInvalidateMoney();
  const [description, setDescription] = useState("");
  const [amount, setAmount] = useState("");
  const [paidById, setPaidById] = useState(meId);
  const [method, setMethod] = useState<"equal" | "exact">("equal");
  const [included, setIncluded] = useState<string[]>(defaultSplitIds?.length ? defaultSplitIds : members.map((m) => m.id));
  const [exact, setExact] = useState<Record<string, string>>({});
  useEffect(() => setPaidById(meId), [meId]);

  const totalCents = parseMoney(amount);
  const exactSum = Object.entries(exact)
    .filter(([id]) => included.includes(id))
    .reduce((s, [, v]) => s + (parseMoney(v) || 0), 0);
  const perPerson = included.length && totalCents > 0 ? Math.floor(totalCents / included.length) : 0;

  const create = useMutation(
    orpc.expenses.create.mutationOptions({
      onSuccess: () => {
        invalidate();
        setDescription("");
        setAmount("");
        setExact({});
        onDone?.();
      },
    }),
  );

  const valid =
    description.trim() &&
    totalCents > 0 &&
    included.length > 0 &&
    (method === "equal" || exactSum === totalCents);

  return (
    <form
      className="space-y-3"
      onSubmit={(e) => {
        e.preventDefault();
        if (!valid) return;
        create.mutate({
          crewId,
          planId,
          description,
          amountCents: totalCents,
          paidById,
          split:
            method === "equal"
              ? { method, userIds: included }
              : { method, shares: included.map((id) => ({ userId: id, amountCents: parseMoney(exact[id] ?? "0") || 0 })) },
        });
      }}
    >
      <div className="grid grid-cols-[1fr_120px] gap-2">
        <input className="input" placeholder="Dinner, tickets, court fee…" value={description} onChange={(e) => setDescription(e.target.value)} />
        <input className="input" inputMode="decimal" placeholder="$0.00" value={amount} onChange={(e) => setAmount(e.target.value)} />
      </div>
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span className="text-muted">Paid by</span>
        <select className="input w-auto py-1.5" value={paidById} onChange={(e) => setPaidById(e.target.value)}>
          {members.map((m) => (
            <option key={m.id} value={m.id}>{m.id === meId ? "me" : m.name}</option>
          ))}
        </select>
        <span className="text-muted">split</span>
        <div className="flex rounded-full border border-line bg-paper p-0.5">
          {(["equal", "exact"] as const).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => setMethod(m)}
              className={`rounded-full px-2.5 py-1 text-xs font-semibold transition ${method === m ? "bg-gradient-to-r from-brand to-violet text-white" : "text-muted"}`}
            >
              {m === "equal" ? "evenly" : "by amount"}
            </button>
          ))}
        </div>
      </div>
      <ul className="grid gap-1.5 sm:grid-cols-2">
        {members.map((m) => {
          const on = included.includes(m.id);
          return (
            <li key={m.id} className={`flex items-center gap-2 rounded-lg border px-2.5 py-1.5 ${on ? "border-line bg-card" : "border-dashed border-line opacity-60"}`}>
              <input
                type="checkbox"
                className="accent-brand"
                checked={on}
                onChange={(e) => setIncluded((xs) => (e.target.checked ? [...xs, m.id] : xs.filter((x) => x !== m.id)))}
              />
              <Avatar name={m.name} color={m.color} size={20} />
              <span className="flex-1 truncate text-sm">{m.id === meId ? "Me" : m.name}</span>
              {on && method === "equal" && <span className="text-xs text-muted">{perPerson ? money(perPerson) : ""}</span>}
              {on && method === "exact" && (
                <input
                  className="input w-20 py-1 text-right"
                  inputMode="decimal"
                  placeholder="0"
                  value={exact[m.id] ?? ""}
                  onChange={(e) => setExact((x) => ({ ...x, [m.id]: e.target.value }))}
                />
              )}
            </li>
          );
        })}
      </ul>
      {method === "exact" && totalCents > 0 && exactSum !== totalCents && (
        <p className="text-xs text-maybe">
          {exactSum < totalCents ? `${money(totalCents - exactSum)} left to assign` : `${money(exactSum - totalCents)} over`}
        </p>
      )}
      {create.error && <p className="text-sm text-nope">{create.error.message}</p>}
      <button className="btn-primary" disabled={!valid || create.isPending}>
        {create.isPending ? "Adding…" : "Add expense"}
      </button>
    </form>
  );
}

export function MoneyTab({ crewId, members, meId }: { crewId: string; members: Member[]; meId: string }) {
  const invalidate = useInvalidateMoney();
  const balances = useQuery(orpc.expenses.balances.queryOptions({ input: { crewId } }));
  const list = useQuery(orpc.expenses.list.queryOptions({ input: { crewId } }));
  const settle = useMutation(orpc.expenses.settleUp.mutationOptions({ onSuccess: invalidate }));
  const remove = useMutation(orpc.expenses.remove.mutationOptions({ onSuccess: invalidate }));
  const [adding, setAdding] = useState(false);
  const name = (id: string) => (id === meId ? "You" : (members.find((m) => m.id === id)?.name ?? balances.data?.members.find((m) => m.id === id)?.name ?? "Someone"));

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-4 lg:grid-cols-[1fr_320px]">
      <div className="space-y-4">
        <div className="card p-4">
          {adding ? (
            <>
              <h3 className="mb-3 font-semibold">Add an expense</h3>
              <ExpenseForm crewId={crewId} members={members} meId={meId} onDone={() => setAdding(false)} />
            </>
          ) : (
            <button className="btn-primary" onClick={() => setAdding(true)}>+ Add expense</button>
          )}
        </div>
        <div className="card divide-y divide-line">
          {list.data?.expenses.map((e) => {
            const myShare = e.shares.find((s) => s.userId === meId)?.amountCents ?? 0;
            return (
              <div key={e.id} className="flex items-center gap-3 p-3.5">
                <Avatar name={e.paidBy.name} color={e.paidBy.color} size={30} />
                <div className="min-w-0 flex-1">
                  <div className="truncate font-medium">{e.description}</div>
                  <div className="truncate text-xs text-muted">
                    {name(e.paidById)} paid {money(e.amountCents)} · split {e.shares.length} way{e.shares.length > 1 ? "s" : ""}
                    {e.plan && (
                      <> · <Link href={`/plans/${e.plan.id}`} className="underline">{e.plan.title}</Link></>
                    )}
                  </div>
                </div>
                <div className="text-right text-sm">
                  {e.paidById === meId ? (
                    <span className="text-go">+{money(e.amountCents - myShare)}</span>
                  ) : myShare ? (
                    <span className="text-nope">−{money(myShare)}</span>
                  ) : (
                    <span className="text-muted">not involved</span>
                  )}
                  {(e.paidById === meId || e.createdById === meId) && (
                    <button
                      className="block w-full text-right text-[11px] text-muted hover:text-nope"
                      onClick={() => confirm(`Delete "${e.description}"?`) && remove.mutate({ expenseId: e.id })}
                    >
                      delete
                    </button>
                  )}
                </div>
              </div>
            );
          })}
          {list.data?.settlements.map((s) => (
            <div key={s.id} className="flex items-center gap-3 p-3.5 text-sm text-muted">
              <span className="flex h-[30px] w-[30px] items-center justify-center">💸</span>
              <span className="flex-1">{name(s.fromUserId)} paid {name(s.toUserId).replace("You", "you")} back</span>
              <span>{money(s.amountCents)}</span>
            </div>
          ))}
          {list.data && !list.data.expenses.length && <p className="p-4 text-sm text-muted">No expenses yet.</p>}
        </div>
      </div>

      <div className="space-y-4">
        <div className="card p-4">
          <h3 className="font-semibold">Settle up</h3>
          <p className="mb-3 text-xs text-muted">Simplified so it takes the fewest payments.</p>
          {balances.data?.transfers.length ? (
            <ul className="space-y-2">
              {balances.data.transfers.map((t) => (
                <li key={`${t.fromUserId}-${t.toUserId}`} className="flex items-center gap-2 text-sm">
                  <span className="flex-1">
                    <b>{name(t.fromUserId)}</b> {t.fromUserId === meId ? "owe" : "owes"} <b>{name(t.toUserId).replace("You", "you")}</b>
                  </span>
                  <span className="font-medium">{money(t.amountCents)}</span>
                  {t.fromUserId === meId && (
                    <button
                      className="btn-ghost px-2 py-1 text-xs"
                      disabled={settle.isPending}
                      onClick={() => settle.mutate({ crewId, toUserId: t.toUserId, amountCents: t.amountCents })}
                    >
                      Mark paid
                    </button>
                  )}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted">Everyone&apos;s square. ✨</p>
          )}
        </div>
        <div className="card p-4">
          <h3 className="mb-2 font-semibold">Balances</h3>
          <ul className="space-y-1.5 text-sm">
            {balances.data?.members.map((m) => (
              <li key={m.id} className="flex items-center gap-2">
                <Avatar name={m.name} color={m.color} size={20} />
                <span className="flex-1">{m.id === meId ? "You" : m.name}</span>
                <span className={m.netCents > 0 ? "text-go" : m.netCents < 0 ? "text-nope" : "text-muted"}>
                  {m.netCents === 0 ? "—" : `${m.netCents > 0 ? "+" : "−"}${money(Math.abs(m.netCents))}`}
                </span>
              </li>
            ))}
          </ul>
          {balances.data && <p className="mt-3 text-xs text-muted">{money(balances.data.totalSpentCents)} spent together so far</p>}
        </div>
      </div>
    </div>
  );
}
