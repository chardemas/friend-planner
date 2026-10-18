import Link from "next/link";
import { AuthShell } from "@/components/auth-shell";
import { ResetForm } from "./reset-form";

export default async function ResetPage({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const { token } = await searchParams;
  if (!token) {
    return (
      <AuthShell title="Link incomplete" blurb="This reset link is missing its code. Open it straight from the email, or request a new one.">
        <Link href="/forgot" className="btn-primary w-full">Request a new link</Link>
      </AuthShell>
    );
  }
  return (
    <AuthShell title="Choose a new password" blurb="You'll be signed out on every other device.">
      <ResetForm token={token} />
    </AuthShell>
  );
}
