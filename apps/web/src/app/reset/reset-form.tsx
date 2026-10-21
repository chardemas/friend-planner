"use client";

import Link from "next/link";
import { useActionState } from "react";
import { resetPasswordAction, type FormState } from "../actions";
import { PasswordInput } from "@/components/password-input";

export function ResetForm({ token }: { token: string }) {
  const [state, action, pending] = useActionState<FormState, FormData>(resetPasswordAction, {});
  return (
    <form action={action} className="card space-y-4 p-5">
      <input type="hidden" name="token" value={token} />
      <div>
        <label className="label" htmlFor="password">New password</label>
        <PasswordInput
          id="password"
          name="password"
          required
          minLength={10}
          maxLength={128}
          autoComplete="new-password"
          autoFocus
          placeholder="At least 10 characters"
        />
      </div>
      {state.error && (
        <p className="text-sm text-nope">
          {state.error} {state.error.includes("expired") && <Link href="/forgot" className="underline underline-offset-4">Get a new link</Link>}
        </p>
      )}
      <button className="btn-primary w-full" disabled={pending}>{pending ? "One sec…" : "Save and sign in"}</button>
    </form>
  );
}
