"use client";

import { useActionState } from "react";
import { signInAction, type SignInState } from "../actions";

export function SignInForm({ next }: { next?: string }) {
  const [state, action, pending] = useActionState<SignInState, FormData>(signInAction, { step: "email" });
  const tz = typeof Intl !== "undefined" ? Intl.DateTimeFormat().resolvedOptions().timeZone : "";
  return (
    <form action={action} className="card space-y-4 p-5">
      <input type="hidden" name="next" value={next ?? "/"} />
      <input type="hidden" name="timezone" value={tz} />
      <div>
        <label className="label" htmlFor="email">Email</label>
        <input
          id="email"
          name="email"
          type="email"
          required
          autoFocus={state.step === "email"}
          defaultValue={state.email}
          readOnly={state.step === "name"}
          placeholder="you@example.com"
          className="input"
        />
      </div>
      {state.step === "name" && (
        <div>
          <label className="label" htmlFor="name">New here! What should friends call you?</label>
          <input id="name" name="name" required autoFocus maxLength={60} placeholder="First name is fine" className="input" />
        </div>
      )}
      {state.error && <p className="text-sm text-nope">{state.error}</p>}
      <button className="btn-primary w-full" disabled={pending}>
        {pending ? "One sec…" : state.step === "name" ? "Create account" : "Continue"}
      </button>
    </form>
  );
}
