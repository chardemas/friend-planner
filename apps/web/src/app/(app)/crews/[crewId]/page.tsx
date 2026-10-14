"use client";

import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useMemo, useState } from "react";
import { orpc } from "@/lib/orpc";
import { dayLabel } from "@/lib/format";
import { Avatar } from "@/components/avatar";
import { CrewHeatmap } from "@/components/crew-heatmap";
import { FindATime } from "@/components/find-a-time";
import { MoneyTab } from "@/components/money";
import { PlanCard, groupByDay } from "@/components/plan-card";

const TABS = [
  { id: "plans", label: "Plans" },
  { id: "free", label: "Who's free" },
  { id: "money", label: "Money" },
  { id: "people", label: "People" },
] as const;
type Tab = (typeof TABS)[number]["id"];

export default function CrewPage() {
  const { crewId } = useParams<{ crewId: string }>();
  const search = useSearchParams();
  const router = useRouter();
  const tab = (search.get("tab") as Tab) || "plans";
  const crew = useQuery(orpc.crews.get.queryOptions({ input: { crewId } }));
  const me = useQuery(orpc.me.get.queryOptions());

  if (crew.error) return <p className="card p-6 text-muted">This crew doesn&apos;t exist or you&apos;re not in it.</p>;
  if (!crew.data || !me.data) return <p className="text-muted">Loading…</p>;
  const c = crew.data;

  return (
    <div>
      <div className="mb-5 flex flex-wrap items-center gap-3">
        <span className="text-4xl">{c.emoji}</span>
        <div className="mr-auto">
          <h1 className="text-2xl font-semibold tracking-tight">{c.name}</h1>
          <div className="mt-0.5 flex items-center gap-1">
            {c.members.slice(0, 8).map((m) => (
              <Avatar key={m.id} name={m.name} color={m.color} size={20} />
            ))}
            <span className="ml-1 text-sm text-muted">{c.members.length} people</span>
          </div>
        </div>
        <Link href={`/plans/new?crew=${crewId}`} className="btn-primary">+ Plan something</Link>
      </div>

      <div className="mb-5 flex gap-1 overflow-x-auto border-b border-line">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => router.replace(`/crews/${crewId}?tab=${t.id}`, { scroll: false })}
            className={`-mb-px whitespace-nowrap border-b-2 px-3 py-2 text-sm font-medium ${
              tab === t.id ? "border-ink text-ink" : "border-transparent text-muted hover:text-ink"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "plans" && <PlansTab crewId={crewId} />}
      {tab === "free" && (
        <div className="space-y-4">
          <FindATime crewId={crewId} />
          <CrewHeatmap crewId={crewId} />
        </div>
      )}
      {tab === "money" && <MoneyTab crewId={crewId} members={c.members} meId={me.data.id} />}
      {tab === "people" && <PeopleTab crew={c} meId={me.data.id} fresh={search.get("new") === "1"} />}
    </div>
  );
}

function PlansTab({ crewId }: { crewId: string }) {
  const range = useMemo(() => {
    const from = new Date();
    from.setHours(0, 0, 0, 0);
    const to = new Date(from);
    to.setDate(to.getDate() + 28);
    return { from, to };
  }, []);
  const q = useQuery(orpc.plans.occurrences.queryOptions({ input: { crewId, ...range } }));
  const days = groupByDay((q.data ?? []).filter((o) => o.end.getTime() > Date.now()));
  if (q.isLoading) return <p className="text-muted">Loading…</p>;
  if (!days.length)
    return (
      <div className="card p-6">
        <p className="font-medium">Nothing planned in the next 4 weeks.</p>
        <p className="mt-1 text-sm text-muted">Check &quot;Who&apos;s free&quot; to find a time that works, then throw something out there.</p>
      </div>
    );
  return (
    <div className="space-y-5">
      {days.map((items) => (
        <div key={items[0]!.start.toDateString()}>
          <h2 className="mb-2 text-sm font-semibold text-muted">{dayLabel(items[0]!.start)}</h2>
          <div className="space-y-2">
            {items.map((o) => (
              <PlanCard key={`${o.planId}-${o.start.getTime()}`} o={o} showCrew={false} />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function PeopleTab({
  crew,
  meId,
  fresh,
}: {
  crew: { id: string; name: string; inviteCode: string; myRole: string; members: { id: string; name: string; color: string; role: string }[] };
  meId: string;
  fresh: boolean;
}) {
  const qc = useQueryClient();
  const router = useRouter();
  const [copied, setCopied] = useState(false);
  const link = typeof window !== "undefined" ? `${window.location.origin}/join/${crew.inviteCode}` : `/join/${crew.inviteCode}`;
  const reset = useMutation(orpc.crews.resetInvite.mutationOptions({ onSuccess: () => qc.invalidateQueries({ queryKey: orpc.crews.key() }) }));
  const leave = useMutation(
    orpc.crews.leave.mutationOptions({
      onSuccess: () => {
        qc.invalidateQueries();
        router.push("/crews");
      },
    }),
  );
  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-4 lg:grid-cols-2">
      <div className={`card p-4 ${fresh ? "ring-2 ring-brand" : ""}`}>
        <h3 className="font-semibold">{fresh ? "🎉 Crew created. Now bring people in." : "Invite people"}</h3>
        <p className="mt-1 text-sm text-muted">Anyone with this link can join {crew.name}. Drop it in the group chat.</p>
        <div className="mt-3 flex gap-2">
          <input readOnly value={link} className="input font-mono text-xs" onFocus={(e) => e.target.select()} />
          <button
            className="btn-primary"
            onClick={async () => {
              await navigator.clipboard?.writeText(link);
              setCopied(true);
              setTimeout(() => setCopied(false), 1500);
            }}
          >
            {copied ? "Copied!" : "Copy"}
          </button>
        </div>
        {crew.myRole === "owner" && (
          <button className="mt-2 text-xs text-muted hover:text-ink" onClick={() => reset.mutate({ crewId: crew.id })}>
            Reset link (old one stops working)
          </button>
        )}
      </div>
      <div className="card p-4">
        <h3 className="mb-3 font-semibold">Members</h3>
        <ul className="space-y-2">
          {crew.members.map((m) => (
            <li key={m.id} className="flex items-center gap-2">
              <Avatar name={m.name} color={m.color} size={28} />
              <span className="flex-1">{m.name}{m.id === meId && <span className="text-muted"> (you)</span>}</span>
              {m.role === "owner" && <span className="chip bg-brand-soft text-brand">owner</span>}
            </li>
          ))}
        </ul>
        <button
          className="mt-4 text-xs text-muted hover:text-nope"
          onClick={() => confirm(`Leave ${crew.name}?`) && leave.mutate({ crewId: crew.id })}
        >
          Leave crew
        </button>
      </div>
    </div>
  );
}
