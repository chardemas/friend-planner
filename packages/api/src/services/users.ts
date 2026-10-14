import { eq, sql } from "drizzle-orm";
import { users, type DbOrTx } from "@lowkey/db";
import { isValidTimeZone } from "../lib/time";
import { badRequest, notFound } from "../orpc";

const COLORS = ["#7c5cff", "#ff6b6b", "#1fb58f", "#f59f00", "#3b82f6", "#e64980", "#0ea5e9", "#a3632b"];

export async function getTimezone(db: DbOrTx, userId: string) {
  const u = await db.query.users.findFirst({ where: eq(users.id, userId), columns: { timezone: true } });
  return u?.timezone ?? "America/New_York";
}

export async function me(db: DbOrTx, userId: string) {
  const u = await db.query.users.findFirst({ where: eq(users.id, userId) });
  if (!u) throw notFound("User");
  return u;
}

/**
 * Passwordless sign-in stub: finds or creates the user by email.
 * Swap for Supabase Auth (magic link / OAuth) before real people use it.
 */
export async function signIn(db: DbOrTx, input: { email: string; name?: string; timezone?: string }) {
  const existing = await db.query.users.findFirst({ where: sql`lower(${users.email}) = ${input.email.toLowerCase()}` });
  if (existing) return { user: existing, created: false };
  if (!input.name) return { user: null, created: false };
  const timezone = input.timezone && isValidTimeZone(input.timezone) ? input.timezone : "America/New_York";
  const color = COLORS[Math.abs([...input.email].reduce((h, c) => (h * 31 + c.charCodeAt(0)) | 0, 7)) % COLORS.length]!;
  const [user] = await db.insert(users).values({ email: input.email.toLowerCase(), name: input.name, timezone, color }).returning();
  return { user: user!, created: true };
}

export async function updateProfile(db: DbOrTx, userId: string, input: { name?: string; timezone?: string }) {
  if (input.timezone && !isValidTimeZone(input.timezone)) throw badRequest("Unknown time zone");
  const [u] = await db.update(users).set(input).where(eq(users.id, userId)).returning();
  return u!;
}
