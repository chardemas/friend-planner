import Link from "next/link";
import { headers } from "next/headers";
import { getProfile } from "@lowkey/api";
import { db } from "@lowkey/db";
import { requireUserId } from "@/lib/session";
import { AppNav } from "@/components/app-nav";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const path = (await headers()).get("x-pathname") ?? undefined;
  const userId = await requireUserId(path);
  const me = await getProfile(db, userId);
  return (
    <div className="min-h-dvh pb-20 sm:pb-0">
      <AppNav />
      {!me.emailVerifiedAt && !path?.startsWith("/account") && (
        <div className="border-b border-line bg-maybe-soft">
          <p className="mx-auto max-w-5xl px-4 py-2 text-sm">
            Check your inbox to confirm your email.{" "}
            <Link href="/account" className="font-medium underline underline-offset-4">Resend it</Link>
          </p>
        </div>
      )}
      <main className="mx-auto max-w-5xl px-4 py-6">{children}</main>
    </div>
  );
}
