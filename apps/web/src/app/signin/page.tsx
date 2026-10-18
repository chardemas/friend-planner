import { redirect } from "next/navigation";
import { AuthShell } from "@/components/auth-shell";
import { currentUserId } from "@/lib/session";
import { SignInForm } from "./sign-in-form";

export default async function SignInPage({ searchParams }: { searchParams: Promise<{ next?: string; deleted?: string }> }) {
  const { next, deleted } = await searchParams;
  const destination = next?.startsWith("/") && !next.startsWith("//") ? next : "/";
  if (await currentUserId()) redirect(destination);
  return (
    <AuthShell
      title="kiki"
      blurb="Plans with your people, minus the group-chat chaos. See who's free, say you're in, split the bill."
    >
      {deleted && <p className="card mb-4 p-3 text-sm">Your account has been deleted. Thanks for hanging out.</p>}
      <SignInForm next={destination} />
    </AuthShell>
  );
}
