import Link from "next/link";
import { verifyEmail } from "@lowkey/api";
import { db } from "@lowkey/db";
import { AuthShell } from "@/components/auth-shell";

export const dynamic = "force-dynamic";

export default async function VerifyPage({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const { token } = await searchParams;
  const ok = token ? await verifyEmail(db, token) : false;
  return ok ? (
    <AuthShell title="Email confirmed ✓" blurb="You're all set. If you ever forget your password, you can reset it by email.">
      <Link href="/" className="btn-primary w-full">Go to kiki</Link>
    </AuthShell>
  ) : (
    <AuthShell
      title="That link didn't work"
      blurb="It may have expired, been used already, or been replaced by a newer email. You can send a new one from your account page."
    >
      <Link href="/account" className="btn-primary w-full">Go to account</Link>
    </AuthShell>
  );
}
