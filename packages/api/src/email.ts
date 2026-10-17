/**
 * Transactional email through Resend's HTTP API (https://resend.com). Set RESEND_API_KEY and EMAIL_FROM.
 * Without a key, development prints the message to the console so links can be clicked from the terminal.
 */
export function appUrl(path = "") {
  const base =
    process.env.APP_URL ??
    (process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : "http://localhost:3000");
  return base.replace(/\/$/, "") + path;
}

export async function sendEmail(message: { to: string; subject: string; text: string }) {
  const key = process.env.RESEND_API_KEY;
  if (!key) {
    if (process.env.NODE_ENV === "production") {
      // Never log message bodies in production: they contain sign-in links.
      console.error(`[email] RESEND_API_KEY is not set; dropped "${message.subject}"`);
    } else {
      console.log(`\n[email] To: ${message.to}\nSubject: ${message.subject}\n\n${message.text}\n`);
    }
    return;
  }
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: process.env.EMAIL_FROM ?? "kiki <onboarding@resend.dev>", ...message }),
  });
  if (!res.ok) console.error(`[email] Resend returned ${res.status}: ${await res.text()}`);
}
