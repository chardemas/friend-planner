"use client";

import Link from "next/link";
import { useActionState } from "react";
import { forgotPasswordAction, type FormState } from "../actions";

export function ForgotForm() {
  const [state, action, pending] = useActionState<FormState, FormData>(forgotPasswordAction, {});
  if (state.message) {
    return (
      <div className="card space-y-4 p-5">
        <p className="text-sm">{state.message}</p>
        <Link href="/signin" className="btn-ghost w-full">Back to sign in</Link>
      </div>
    );
  }
  return (
    <form action={action} className="card space-y-4 p-5">
      <div>
        <label className="label" htmlFor="email">Email</label>
        <input id="email" name="email" type="email" required autoComplete="email" autoFocus placeholder="you@example.com" className="input" />
      </div>
      {state.error && <p className="text-sm text-nope">{state.error}</p>}
      <button className="btn-primary w-full" disabled={pending}>{pending ? "One sec…" : "Send reset link"}</button>
      <p className="text-center text-sm text-muted">
        <Link href="/signin" className="underline underline-offset-4">Back to sign in</Link>
      </p>
    </form>
  );
}
