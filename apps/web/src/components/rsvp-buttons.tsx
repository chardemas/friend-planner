"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { orpc } from "@/lib/orpc";
import type { RsvpStatus } from "@lowkey/validators";

const OPTIONS: { status: RsvpStatus; label: string; on: string }[] = [
  { status: "going", label: "I'm in", on: "bg-go text-white border-go" },
  { status: "maybe", label: "Maybe", on: "bg-maybe text-white border-maybe" },
  { status: "declined", label: "Can't", on: "bg-nope text-white border-nope" },
];

export function RsvpButtons({
  planId,
  occurrenceStart,
  status,
  repeatsWeekly,
  compact,
}: {
  planId: string;
  occurrenceStart: Date;
  status: RsvpStatus | null;
  repeatsWeekly?: boolean;
  compact?: boolean;
}) {
  const qc = useQueryClient();
  const [everyWeek, setEveryWeek] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const mutation = useMutation(
    orpc.plans.rsvp.mutationOptions({
      onMutate: () => setError(null),
      onError: (e) => setError(e.message),
      onSuccess: () => {
        qc.invalidateQueries({ queryKey: orpc.plans.key() });
        qc.invalidateQueries({ queryKey: orpc.availability.key() });
      },
    }),
  );
  const optimistic = mutation.isPending ? mutation.variables?.status : status;

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex flex-wrap items-center gap-1.5">
        {OPTIONS.map((o) => (
          <button
            key={o.status}
            type="button"
            onClick={() => {
              mutation.mutate({ planId, occurrenceStart, status: o.status, scope: everyWeek ? "series" : "occurrence" });
            }}
            className={`rounded-full border px-3 ${compact ? "py-1 text-xs" : "py-1.5 text-sm"} font-medium transition ${
              optimistic === o.status ? o.on : "border-line bg-card text-ink hover:bg-paper"
            }`}
          >
            {o.label}
          </button>
        ))}
        {repeatsWeekly && (
          <label className="ml-1 flex cursor-pointer items-center gap-1 text-xs text-muted">
            <input type="checkbox" checked={everyWeek} onChange={(e) => setEveryWeek(e.target.checked)} className="accent-brand" />
            every week
          </label>
        )}
      </div>
      {error && <p className="text-xs text-nope">{error}</p>}
    </div>
  );
}
