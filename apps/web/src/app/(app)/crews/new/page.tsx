"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { orpc } from "@/lib/orpc";

const EMOJIS = ["🫶", "🏐", "🏀", "⚽", "🎾", "🧗", "🍜", "🍕", "🎲", "🎮", "🎤", "🏃", "🍻", "☕", "🏡", "🎬"];

export default function NewCrewPage() {
  const router = useRouter();
  const qc = useQueryClient();
  const [name, setName] = useState("");
  const [emoji, setEmoji] = useState("🫶");
  const create = useMutation(
    orpc.crews.create.mutationOptions({
      onSuccess: (crew) => {
        qc.invalidateQueries({ queryKey: orpc.crews.key() });
        router.push(`/crews/${crew.id}?tab=people&new=1`);
      },
    }),
  );
  return (
    <form
      className="mx-auto max-w-md space-y-5"
      onSubmit={(e) => {
        e.preventDefault();
        create.mutate({ name, emoji });
      }}
    >
      <h1 className="text-2xl font-semibold tracking-tight">Start a crew</h1>
      <div>
        <label className="label" htmlFor="name">Name</label>
        <input id="name" className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Tuesday Volleyball, Dinner Club, The Roommates…" required maxLength={60} autoFocus />
      </div>
      <div>
        <span className="label">Vibe</span>
        <div className="grid grid-cols-8 gap-1.5">
          {EMOJIS.map((e) => (
            <button
              type="button"
              key={e}
              onClick={() => setEmoji(e)}
              className={`aspect-square rounded-xl text-xl transition ${emoji === e ? "bg-brand-soft ring-2 ring-brand" : "bg-card hover:bg-brand-soft"}`}
            >
              {e}
            </button>
          ))}
        </div>
      </div>
      {create.error && <p className="text-sm text-nope">{create.error.message}</p>}
      <button className="btn-primary w-full" disabled={create.isPending || !name.trim()}>
        {create.isPending ? "Creating…" : "Create crew"}
      </button>
    </form>
  );
}
