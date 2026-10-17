import { redirect } from "next/navigation";
import { currentUserId } from "@/lib/session";
import { SignInForm } from "./sign-in-form";

export default async function SignInPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { next } = await searchParams;
  const destination = next?.startsWith("/") && !next.startsWith("//") ? next : "/";
  if (await currentUserId()) redirect(destination);
  return (
    <main className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center px-4 py-10">
      <div className="mb-8">
        <div className="mb-3 text-4xl">🫶</div>
        <h1 className="text-3xl font-semibold tracking-tight">kiki</h1>
        <p className="mt-2 text-muted">
          Plans with your people, minus the group-chat chaos. See who&apos;s free, say you&apos;re in, split the bill.
        </p>
      </div>
      <SignInForm next={destination} />
    </main>
  );
}
