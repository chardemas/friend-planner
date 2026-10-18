"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { signInAction, type SignInState } from "../actions";

export function SignInForm({ next }: { next?: string }) {
  const [state, action, pending] = useActionState<SignInState, FormData>(signInAction, { mode: "signin" });
  const [mode, setMode] = useState<SignInState["mode"]>("signin");
  const tz = typeof Intl !== "undefined" ? Intl.DateTimeFormat().resolvedOptions().timeZone : "";
  return (
    <form action={action} className="card space-y-4 p-5">
      <input type="hidden" name="next" value={next ?? "/"} />
      <input type="hidden" name="timezone" value={tz} />
      <input type="hidden" name="mode" value={mode} />
      <div>
        <label className="label" htmlFor="email">Email</label>
        <input
          id="email"
          name="email"
          type="email"
          required
          autoComplete="email"
          autoFocus
          placeholder="you@example.com"
          className="input"
        />
      </div>
      {mode === "signup" && (
        <div>
          <label className="label" htmlFor="name">What should friends call you?</label>
          <input id="name" name="name" required maxLength={60} autoComplete="name" placeholder="First name is fine" className="input" />
        </div>
      )}
      <div>
        <div className="flex items-baseline justify-between">
          <label className="label" htmlFor="password">Password</label>
          {mode === "signin" && (
            <Link href="/forgot" className="text-xs text-muted underline underline-offset-4 hover:text-ink">Forgot?</Link>
          )}
        </div>
        <input
          id="password"
          name="password"
          type="password"
          required
          minLength={10}
          maxLength={128}
          autoComplete={mode === "signup" ? "new-password" : "current-password"}
          placeholder={mode === "signup" ? "At least 10 characters" : "Your password"}
          className="input"
        />
      </div>
      {state.mode === mode && state.error && <p className="text-sm text-nope">{state.error}</p>}
      <button className="btn-primary w-full" disabled={pending}>
        {pending ? "One sec…" : mode === "signup" ? "Create account" : "Sign in"}
      </button>
      <p className="text-center text-sm text-muted">
        {mode === "signup" ? "Already have an account?" : "New to kiki?"}{" "}
        <button
          type="button"
          className="font-medium text-ink underline underline-offset-4"
          onClick={() => setMode(mode === "signup" ? "signin" : "signup")}
        >
          {mode === "signup" ? "Sign in" : "Create an account"}
        </button>
      </p>
    </form>
  );
}
