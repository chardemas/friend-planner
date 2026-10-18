import Link from "next/link";
import { getProfile } from "@lowkey/api";
import { db } from "@lowkey/db";
import { requireUserId } from "@/lib/session";
import { DeleteAccountForm, ResendVerificationButton, SignOutOthersButton } from "./account-forms";

export default async function AccountPage() {
  const userId = await requireUserId("/account");
  const me = await getProfile(db, userId);
  return (
    <div className="mx-auto max-w-md space-y-6">
      <h1 className="text-2xl font-semibold tracking-tight">Account</h1>

      <section className="card space-y-2 p-5">
        <h2 className="font-medium">{me.name}</h2>
        <p className="text-sm text-muted">{me.email}</p>
        {me.emailVerifiedAt ? (
          <p className="text-sm text-go">✓ Email confirmed</p>
        ) : (
          <div className="space-y-2 pt-1">
            <p className="text-sm">Your email isn&apos;t confirmed yet, so you can&apos;t reset your password by email.</p>
            <ResendVerificationButton />
          </div>
        )}
      </section>

      <section className="card space-y-3 p-5">
        <h2 className="font-medium">Devices</h2>
        <p className="text-sm text-muted">Lost a phone or signed in on a shared computer? Sign out everywhere except here.</p>
        <SignOutOthersButton />
      </section>

      <section className="card space-y-3 border-nope/30 p-5">
        <h2 className="font-medium text-nope">Delete account</h2>
        <p className="text-sm text-muted">
          This removes your availability, RSVPs, and crew memberships, and cancels plans you organized that haven&apos;t
          happened yet. Expenses you shared stay on the books for your friends, listed under &quot;Deleted user&quot;. This
          can&apos;t be undone.
        </p>
        <DeleteAccountForm />
      </section>

      <p className="text-center text-xs text-muted">
        <Link href="/privacy" className="underline underline-offset-4">Privacy</Link>
      </p>
    </div>
  );
}
