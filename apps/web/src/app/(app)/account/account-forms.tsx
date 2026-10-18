"use client";

import { useActionState } from "react";
import {
  deleteAccountAction,
  resendVerificationAction,
  signOutOtherDevicesAction,
  type FormState,
} from "@/app/actions";

function Feedback({ state }: { state: FormState }) {
  if (state.error) return <p className="text-sm text-nope">{state.error}</p>;
  if (state.message) return <p className="text-sm text-go">{state.message}</p>;
  return null;
}

export function ResendVerificationButton() {
  const [state, action, pending] = useActionState<FormState>(resendVerificationAction, {});
  return (
    <form action={action} className="space-y-2">
      <button className="btn-ghost" disabled={pending}>{pending ? "Sending…" : "Send confirmation email"}</button>
      <Feedback state={state} />
    </form>
  );
}

export function SignOutOthersButton() {
  const [state, action, pending] = useActionState<FormState>(signOutOtherDevicesAction, {});
  return (
    <form action={action} className="space-y-2">
      <button className="btn-ghost" disabled={pending}>{pending ? "One sec…" : "Sign out other devices"}</button>
      <Feedback state={state} />
    </form>
  );
}

export function DeleteAccountForm() {
  const [state, action, pending] = useActionState<FormState, FormData>(deleteAccountAction, {});
  return (
    <form action={action} className="space-y-3">
      <div>
        <label className="label" htmlFor="delete-password">Password</label>
        <input id="delete-password" name="password" type="password" required autoComplete="current-password" className="input" />
      </div>
      <div>
        <label className="label" htmlFor="delete-confirm">Type DELETE to confirm</label>
        <input id="delete-confirm" name="confirm" required autoComplete="off" className="input" placeholder="DELETE" />
      </div>
      <Feedback state={state} />
      <button className="btn w-full bg-nope text-white hover:opacity-90" disabled={pending}>
        {pending ? "Deleting…" : "Delete my account"}
      </button>
    </form>
  );
}
