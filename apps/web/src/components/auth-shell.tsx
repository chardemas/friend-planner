import Link from "next/link";

/** The centered card layout shared by sign-in, password reset, and email verification. */
export function AuthShell({ title, blurb, children }: { title: string; blurb?: React.ReactNode; children: React.ReactNode }) {
  return (
    <main className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center px-4 py-10">
      <div className="mb-8">
        <Link href="/" className="mb-3 block text-4xl">🫶</Link>
        <h1 className="text-3xl font-semibold tracking-tight">{title}</h1>
        {blurb && <p className="mt-2 text-muted">{blurb}</p>}
      </div>
      {children}
      <p className="mt-6 text-center text-xs text-muted">
        <Link href="/privacy" className="underline underline-offset-4">Privacy</Link>
      </p>
    </main>
  );
}
