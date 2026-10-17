import Link from "next/link";

export const metadata = { title: "Privacy · kiki" };

const UPDATED = "October 17, 2026";

export default function PrivacyPage() {
  const contact = process.env.CONTACT_EMAIL;
  return (
    <main className="mx-auto max-w-2xl space-y-6 px-4 py-10 text-[15px] leading-relaxed">
      <Link href="/" className="text-sm text-muted underline underline-offset-4">← kiki</Link>
      <h1 className="text-3xl font-semibold tracking-tight">Privacy</h1>
      <p className="text-sm text-muted">Last updated {UPDATED}</p>

      <p>
        kiki is a small app for making plans with friends. It only keeps what it needs to do that, never sells your data,
        and has no ads or third-party tracking.
      </p>

      <h2 className="text-lg font-semibold">What we store</h2>
      <ul className="list-disc space-y-1 pl-5">
        <li><b>Account:</b> your name, email address, time zone, and a salted hash of your password (never the password itself).</li>
        <li><b>What you add:</b> crews you join, plans you create, RSVPs, availability you paint or add, and expenses and payments you record.</li>
        <li><b>Sign-in sessions:</b> a record for each signed-in device, so you can sign them out.</li>
        <li><b>Abuse protection:</b> short-lived counters keyed by IP address or email to rate-limit sign-in attempts. They expire within a day.</li>
      </ul>

      <h2 className="text-lg font-semibold">Who can see it</h2>
      <p>
        People in your crews see your name, your RSVPs, and whether you&apos;re busy or free. They never see the labels on
        your busy blocks, and plans in crews they aren&apos;t part of show only as &quot;Has plans&quot;. Expenses are visible to
        the crew they belong to.
      </p>

      <h2 className="text-lg font-semibold">Services we use</h2>
      <p>
        The app is hosted on Vercel, data is stored in a Postgres database run by Supabase, and account emails (confirmation
        and password reset) are sent through Resend. They process data only to provide those services.
      </p>

      <h2 className="text-lg font-semibold">Deleting your data</h2>
      <p>
        You can delete your account at any time from the <Link href="/account" className="underline underline-offset-4">account page</Link>.
        That removes your availability, RSVPs, crew memberships, and sessions, and replaces your name and email with
        &quot;Deleted user&quot;. Expenses you shared stay so your friends&apos; balances still add up, but they&apos;re no longer linked to you.
      </p>

      {contact && (
        <>
          <h2 className="text-lg font-semibold">Questions</h2>
          <p>Email <a href={`mailto:${contact}`} className="underline underline-offset-4">{contact}</a>.</p>
        </>
      )}
    </main>
  );
}
