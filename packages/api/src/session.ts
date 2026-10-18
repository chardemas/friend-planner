import { createHash, randomBytes } from "node:crypto";
import { and, eq, gt, isNull, lt, ne, sql } from "drizzle-orm";
import { sessions, users, type DbOrTx } from "@lowkey/db";
import { SESSION_TTL_MS } from "./session-cookie";

/**
 * Database-backed sessions. The client holds a random token (web: httpOnly cookie, mobile: Bearer token)
 * and we store only its SHA-256, so a leaked database can't be replayed. Deleting the row signs that device out.
 */
export { SESSION_COOKIE, SESSION_TTL_MS } from "./session-cookie";
/** Sessions slide forward at most once a day so active users stay signed in without a write per request. */
const REFRESH_AFTER_MS = 24 * 60 * 60 * 1000;

export const hashToken = (token: string) => createHash("sha256").update(token).digest("hex");
export const randomToken = () => randomBytes(32).toString("base64url");

export async function createSession(db: DbOrTx, userId: string) {
  const token = randomToken();
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);
  await db.insert(sessions).values({ userId, tokenHash: hashToken(token), expiresAt });
  // Sweep this user's dead sessions so the table doesn't grow forever.
  await db.delete(sessions).where(and(eq(sessions.userId, userId), lt(sessions.expiresAt, sql`now()`)));
  return { token, expiresAt };
}

/** Returns the signed-in user's id, or null if the token is missing, unknown, expired, or the account was deleted. */
export async function resolveSession(db: DbOrTx, token: string | undefined | null): Promise<string | null> {
  if (!token || token.length > 128) return null;
  const [row] = await db
    .select({ id: sessions.id, userId: sessions.userId, lastUsedAt: sessions.lastUsedAt })
    .from(sessions)
    .innerJoin(users, eq(users.id, sessions.userId))
    .where(and(eq(sessions.tokenHash, hashToken(token)), gt(sessions.expiresAt, sql`now()`), isNull(users.deletedAt)))
    .limit(1);
  if (!row) return null;
  if (Date.now() - row.lastUsedAt.getTime() > REFRESH_AFTER_MS) {
    await db
      .update(sessions)
      .set({ lastUsedAt: new Date(), expiresAt: new Date(Date.now() + SESSION_TTL_MS) })
      .where(eq(sessions.id, row.id));
  }
  return row.userId;
}

export async function revokeSession(db: DbOrTx, token: string | undefined | null) {
  if (token) await db.delete(sessions).where(eq(sessions.tokenHash, hashToken(token)));
}

/** Signs the user out everywhere, optionally keeping the current device. */
export async function revokeAllSessions(db: DbOrTx, userId: string, keepToken?: string) {
  await db
    .delete(sessions)
    .where(and(eq(sessions.userId, userId), keepToken ? ne(sessions.tokenHash, hashToken(keepToken)) : undefined));
}

