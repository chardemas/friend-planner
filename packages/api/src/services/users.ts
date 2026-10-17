import { eq, sql } from "drizzle-orm";
import { randomBytes, scrypt as scryptCallback, timingSafeEqual } from "node:crypto";
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

function deriveKey(password: string, salt: Buffer): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scryptCallback(password, salt, 64, (error, key) => {
      if (error) reject(error);
      else resolve(key);
    });
  });
}

export async function hashPassword(password: string) {
  const salt = randomBytes(16);
  const key = await deriveKey(password, salt);
  return `scrypt$${salt.toString("base64url")}$${key.toString("base64url")}`;
}

export async function verifyPassword(password: string, encoded: string) {
  const [algorithm, saltPart, keyPart, ...extra] = encoded.split("$");
  if (algorithm !== "scrypt" || !saltPart || !keyPart || extra.length > 0) {
    throw new Error("Invalid password hash format");
  }
  const salt = Buffer.from(saltPart, "base64url");
  const expected = Buffer.from(keyPart, "base64url");
  if (salt.length !== 16 || expected.length !== 64) throw new Error("Invalid password hash format");
  const actual = await deriveKey(password, salt);
  return timingSafeEqual(expected, actual);
}

/** Creates or returns an account for trusted seed/test setup, not for authentication. */
export async function createUser(db: DbOrTx, input: { email: string; name: string; timezone?: string }) {
  const existing = await db.query.users.findFirst({ where: sql`lower(${users.email}) = ${input.email.toLowerCase()}` });
  if (existing) return { user: existing, created: false };
  const timezone = input.timezone && isValidTimeZone(input.timezone) ? input.timezone : "America/New_York";
  const color = COLORS[Math.abs([...input.email].reduce((h, c) => (h * 31 + c.charCodeAt(0)) | 0, 7)) % COLORS.length]!;
  const [user] = await db.insert(users).values({ email: input.email.toLowerCase(), name: input.name, timezone, color }).returning();
  return { user: user!, created: true };
}

export async function createAccount(
  db: DbOrTx,
  input: { email: string; password: string; name: string; timezone?: string },
) {
  const existing = await db.query.users.findFirst({ where: sql`lower(${users.email}) = ${input.email.toLowerCase()}` });
  if (existing) return null;
  const timezone = input.timezone && isValidTimeZone(input.timezone) ? input.timezone : "America/New_York";
  const color = COLORS[Math.abs([...input.email].reduce((h, c) => (h * 31 + c.charCodeAt(0)) | 0, 7)) % COLORS.length]!;
  const passwordHash = await hashPassword(input.password);
  const [user] = await db.insert(users).values({
    email: input.email.toLowerCase(),
    name: input.name,
    timezone,
    color,
    passwordHash,
  }).returning();
  return user!;
}

export async function authenticateUser(db: DbOrTx, input: { email: string; password: string }) {
  const user = await db.query.users.findFirst({ where: sql`lower(${users.email}) = ${input.email.toLowerCase()}` });
  if (!user?.passwordHash) {
    await deriveKey(input.password, Buffer.alloc(16));
    return null;
  }
  return (await verifyPassword(input.password, user.passwordHash)) ? user : null;
}

export async function updateProfile(db: DbOrTx, userId: string, input: { name?: string; timezone?: string }) {
  if (input.timezone && !isValidTimeZone(input.timezone)) throw badRequest("Unknown time zone");
  const [u] = await db.update(users).set(input).where(eq(users.id, userId)).returning();
  return u!;
}
