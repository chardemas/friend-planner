"use client";

import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { orpc } from "@/lib/orpc";
import { kindEmoji, toLocalInput } from "@/lib/format";
import { planKinds, type PlanKind } from "@lowkey/validators";
import { Avatar } from "@/components/avatar";

function defaultStart() {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  d.setHours(19, 0, 0, 0);
  return toLocalInput(d);
}

function useDebounced<T>(value: T, ms = 350) {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

export default function NewPlanPage() {
  const search = useSearchParams();
  const router = useRouter();
  const qc = useQueryClient();
  const crews = useQuery(orpc.crews.list.queryOptions());
  const [crewId, setCrewId] = useState(search.get("crew") ?? "");
  useEffect(() => {
    if (!crewId && crews.data?.[0]) setCrewId(crews.data[0].id);
  }, [crews.data, crewId]);
  const crew = useQuery(orpc.crews.get.queryOptions({ input: { crewId }, enabled: !!crewId }));

  const [title, setTitle] = useState("");
  const [kind, setKind] = useState<PlanKind>("hang");
  const [start, setStart] = useState(search.get("start") ?? defaultStart());
  const [minutes, setMinutes] = useState(Number(search.get("mins")) || 120);
  const [weekly, setWeekly] = useState(false);
  const [until, setUntil] = useState("");
  const [location, setLocation] = useState("");
  const [description, setDescription] = useState("");
  const [capacity, setCapacity] = useState("");
  const [invitees, setInvitees] = useState<string[] | null>(null); // null = whole crew

  useEffect(() => setInvitees(null), [crewId]);

  const startsAt = useMemo(() => new Date(start), [start]);
  const endsAt = useMemo(() => new Date(startsAt.getTime() + minutes * 60_000), [startsAt, minutes]);
  const valid = !isNaN(startsAt.getTime());
  const members = crew.data?.members ?? [];
  const inviteeIds = invitees ?? members.map((m) => m.id);

  const conflictInput = useDebounced({ crewId, startsAt, endsAt, inviteeIds: invitees ?? undefined });
  const conflicts = useQuery(
    orpc.plans.conflicts.queryOptions({
      input: conflictInput,
      enabled: !!conflictInput.crewId && !isNaN(conflictInput.startsAt.getTime()),
      placeholderData: (prev) => prev,
    }),
  );

  const create = useMutation(
    orpc.plans.create.mutationOptions({
      onSuccess: (plan) => {
        qc.invalidateQueries({ queryKey: orpc.plans.key() });
        router.push(`/plans/${plan.id}`);
      },
    }),
  );

  if (crews.data?.length === 0)
    return (
      <div className="card mx-auto max-w-md p-6">
        <p className="font-medium">Plans live in a crew.</p>
        <p className="mt-1 text-sm text-muted">Start one first (it takes ten seconds), then come back.</p>
        <Link href="/crews/new" className="btn-primary mt-4">Start a crew</Link>
      </div>
    );

  const busy = conflicts.data?.filter((c) => c.status === "busy") ?? [];
  const free = conflicts.data?.filter((c) => c.status !== "busy") ?? [];

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-6 lg:grid-cols-[1fr_300px]">
      <form
        className="space-y-5"
        onSubmit={(e) => {
          e.preventDefault();
          create.mutate({
            crewId,
            title,
            kind,
            startsAt,
            endsAt,
            repeatsWeekly: weekly,
            repeatUntil: weekly && until ? new Date(`${until}T23:59`) : undefined,
            location: location || undefined,
            description: description || undefined,
            capacity: capacity ? Number(capacity) : undefined,
            inviteeIds: invitees ?? undefined,
          });
        }}
      >
        <h1 className="text-2xl font-semibold tracking-tight">What&apos;s the plan?</h1>

        <div className="grid gap-3 sm:grid-cols-[1fr_200px]">
          <div>
            <label className="label" htmlFor="title">Title</label>
            <input id="title" className="input" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Pickup basketball, ramen, movie night…" required maxLength={100} autoFocus />
          </div>
          <div>
            <label className="label" htmlFor="crew">Crew</label>
            <select id="crew" className="input" value={crewId} onChange={(e) => setCrewId(e.target.value)}>
              {crews.data?.map((c) => (
                <option key={c.id} value={c.id}>{c.emoji} {c.name}</option>
              ))}
            </select>
          </div>
        </div>

        <div>
          <span className="label">Kind</span>
          <div className="flex flex-wrap gap-1.5">
            {planKinds.map((k) => (
              <button
                key={k}
                type="button"
                onClick={() => setKind(k)}
                className={`rounded-full border px-3 py-1.5 text-sm capitalize transition ${kind === k ? "border-transparent bg-gradient-to-r from-brand to-violet font-semibold text-white shadow-(--shadow-glow)" : "border-line bg-card hover:bg-brand-soft"}`}
              >
                {kindEmoji[k]} {k}
              </button>
            ))}
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-[1fr_160px]">
          <div>
            <label className="label" htmlFor="start">When</label>
            <input id="start" type="datetime-local" className="input" value={start} onChange={(e) => setStart(e.target.value)} required />
          </div>
          <div>
            <label className="label" htmlFor="dur">How long</label>
            <select id="dur" className="input" value={minutes} onChange={(e) => setMinutes(Number(e.target.value))}>
              {[30, 60, 90, 120, 150, 180, 240, 300, 360, 480].map((m) => (
                <option key={m} value={m}>{m < 60 ? `${m} min` : `${m / 60} hr${m > 60 ? "s" : ""}`}</option>
              ))}
            </select>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" className="accent-brand" checked={weekly} onChange={(e) => setWeekly(e.target.checked)} />
            Repeats every week
          </label>
          {weekly && (
            <label className="flex items-center gap-2 text-sm text-muted">
              until
              <input type="date" className="input w-auto py-1.5" value={until} onChange={(e) => setUntil(e.target.value)} />
              <span className="text-xs">(optional)</span>
            </label>
          )}
        </div>

        <div className="grid gap-3 sm:grid-cols-[1fr_140px]">
          <div>
            <label className="label" htmlFor="loc">Where</label>
            <input id="loc" className="input" value={location} onChange={(e) => setLocation(e.target.value)} placeholder="Optional" maxLength={200} />
          </div>
          <div>
            <label className="label" htmlFor="cap">Spots</label>
            <input id="cap" className="input" inputMode="numeric" value={capacity} onChange={(e) => setCapacity(e.target.value.replace(/\D/g, ""))} placeholder="No limit" />
          </div>
        </div>

        <div>
          <label className="label" htmlFor="desc">Details</label>
          <textarea id="desc" className="input min-h-20" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Bring a ball. Splitting a cab after." maxLength={1000} />
        </div>

        {members.length > 0 && (
          <div>
            <div className="mb-1 flex items-center justify-between">
              <span className="label mb-0">Who&apos;s invited</span>
              <button type="button" className="text-xs text-brand" onClick={() => setInvitees(invitees ? null : [])}>
                {invitees ? "Invite whole crew" : "Pick people"}
              </button>
            </div>
            {invitees === null ? (
              <p className="text-sm text-muted">Everyone in {crew.data?.name} ({members.length})</p>
            ) : (
              <div className="flex flex-wrap gap-1.5">
                {members.map((m) => {
                  const on = inviteeIds.includes(m.id);
                  return (
                    <button
                      type="button"
                      key={m.id}
                      onClick={() => setInvitees((xs) => (on ? (xs ?? []).filter((x) => x !== m.id) : [...(xs ?? []), m.id]))}
                      className={`flex items-center gap-1.5 rounded-full border py-1 pl-1 pr-3 text-sm ${on ? "border-brand/40 bg-brand-soft" : "border-line opacity-60"}`}
                    >
                      <Avatar name={m.name} color={m.color} size={20} /> {m.name}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {create.error && <p className="text-sm text-nope">{create.error.message}</p>}
        <button className="btn-primary w-full sm:w-auto" disabled={!title.trim() || !crewId || !valid || create.isPending}>
          {create.isPending ? "Sending…" : "Send it"}
        </button>
      </form>

      <aside className="space-y-3">
        <div className="card p-4">
          <h2 className="font-semibold">Who can make it?</h2>
          <p className="mb-3 text-xs text-muted">Checked against everyone&apos;s availability and plans they&apos;re going to.</p>
          {conflicts.data ? (
            <>
              <div className="mb-3 text-sm">
                <span className={`chip ${busy.length ? "bg-maybe-soft text-maybe" : "bg-go-soft text-go"}`}>
                  {free.length} of {conflicts.data.length} free
                </span>
              </div>
              <ul className="space-y-1.5 text-sm">
                {[...busy, ...free].map((c) => (
                  <li key={c.userId} className="flex items-center gap-2">
                    <Avatar name={c.name} color={c.color} size={22} />
                    <span className="flex-1">{c.name}</span>
                    {c.status === "busy" ? (
                      <span className="chip max-w-[130px] truncate bg-nope-soft text-nope" title={c.reasons.join(", ")}>{c.reasons[0]}</span>
                    ) : c.status === "free" ? (
                      <span className="chip bg-go-soft text-go">free 👍</span>
                    ) : (
                      <span className="chip bg-paper text-muted">looks ok</span>
                    )}
                  </li>
                ))}
              </ul>
            </>
          ) : (
            <p className="text-sm text-muted">Pick a crew and time.</p>
          )}
          {crewId && (
            <Link href={`/crews/${crewId}?tab=free`} className="mt-4 block text-sm text-brand">
              Find a time that works for more people →
            </Link>
          )}
        </div>
      </aside>
    </div>
  );
}
