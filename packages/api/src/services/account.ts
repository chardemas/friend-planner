import { and, asc, eq, gt, isNull, ne, or, sql } from "drizzle-orm";
import {
  authTokens,
  availabilityBlocks,
  crewMembers,
  planInvitees,
  plans,
  rsvps,
  sessions,
  users,
  type DbOrTx,
} from "@lowkey/db";
import { appUrl, sendEmail } from "../email";
import { hashToken, randomToken, revokeAllSessions } from "../session";
import { hashPassword, verifyPassword } from "./users";

type Purpose = "verify_email" | "reset_password";
const TTL_MS: Record<Purpose, number> = { verify_email: 3 * 24 * 60 * 60 * 1000, reset_password: 60 * 60 * 1000 };

/** Issues a fresh single-use token, replacing any earlier unused one for the same purpose. */
async function issueToken(db: DbOrTx, userId: string, purpose: Purpose) {
  const token = randomToken();
  await db.delete(authTokens).where(and(eq(authTokens.userId, userId), eq(authTokens.purpose, purpose)));
  await db.insert(authTokens).values({
    userId,
    purpose,
    tokenHash: hashToken(token),
    expiresAt: new Date(Date.now() + TTL_MS[purpose]),
  });
  return token;
}

/** Marks a token used and returns its user, atomically, so a link can't be redeemed twice. */
async function consumeToken(db: DbOrTx, token: string, purpose: Purpose) {
  if (!token || token.length > 128) return null;
  const [row] = await db
    .update(authTokens)
    .set({ usedAt: new Date() })
    .where(
      and(
        eq(authTokens.tokenHash, hashToken(token)),
        eq(authTokens.purpose, purpose),
        isNull(authTokens.usedAt),
        gt(authTokens.expiresAt, sql`now()`),
      ),
    )
    .returning({ userId: authTokens.userId });
  return row?.userId ?? null;
}

const findActiveByEmail = (db: DbOrTx, email: string) =>
  db.query.users.findFirst({ where: and(sql`lower(${users.email}) = ${email.toLowerCase()}`, isNull(users.deletedAt)) });

export async function sendVerificationEmail(db: DbOrTx, userId: string) {
  const user = await db.query.users.findFirst({ where: eq(users.id, userId) });
  if (!user || user.deletedAt || user.emailVerifiedAt) return;
  const token = await issueToken(db, user.id, "verify_email");
  await sendEmail({
    to: user.email,
    subject: "Confirm your email for kiki",
    text: `Hi ${user.name},\n\nConfirm your email so you can reset your password if you ever forget it:\n\n${appUrl(`/verify?token=${token}`)}\n\nThis link works for 3 days. If you didn't sign up for kiki, you can ignore this email.`,
  });
}

export async function verifyEmail(db: DbOrTx, token: string) {
  const userId = await consumeToken(db, token, "verify_email");
  if (!userId) return false;
  await db.update(users).set({ emailVerifiedAt: new Date() }).where(and(eq(users.id, userId), isNull(users.emailVerifiedAt)));
  return true;
}

/** Always succeeds from the caller's point of view so the form can't be used to find out who has an account. */
export async function requestPasswordReset(db: DbOrTx, email: string) {
  const user = await findActiveByEmail(db, email);
  if (!user) return;
  const token = await issueToken(db, user.id, "reset_password");
  await sendEmail({
    to: user.email,
    subject: "Reset your kiki password",
    text: `Hi ${user.name},\n\nSomeone (hopefully you) asked to reset your kiki password. Choose a new one here:\n\n${appUrl(`/reset?token=${token}`)}\n\nThis link works for 1 hour. If you didn't ask for this, you can ignore this email and your password stays the same.`,
  });
}

/** Sets a new password and signs out every existing session. Returns the user id, or null for a bad/expired link. */
export async function resetPassword(db: DbOrTx, token: string, password: string) {
  const userId = await consumeToken(db, token, "reset_password");
  if (!userId) return null;
  const passwordHash = await hashPassword(password);
  // Opening the emailed link proves they own the address.
  await db
    .update(users)
    .set({ passwordHash, emailVerifiedAt: sql`coalesce(${users.emailVerifiedAt}, now())` })
    .where(eq(users.id, userId));
  await revokeAllSessions(db, userId);
  return userId;
}

/**
 * Deletes an account after re-checking the password. Personal data (availability, RSVPs, memberships, sessions)
 * is removed and the user row is anonymized rather than dropped, so expenses they were part of still balance
 * for everyone else. Their upcoming plans are cancelled and crews they owned pass to the longest-standing member.
 */
export async function deleteAccount(db: DbOrTx, userId: string, password: string) {
  const user = await db.query.users.findFirst({ where: eq(users.id, userId) });
  if (!user?.passwordHash || user.deletedAt) return false;
  if (!(await verifyPassword(password, user.passwordHash))) return false;

  await db.transaction(async (tx) => {
    const owned = await tx
      .select({ crewId: crewMembers.crewId })
      .from(crewMembers)
      .where(and(eq(crewMembers.userId, userId), eq(crewMembers.role, "owner")));
    for (const { crewId } of owned) {
      const [heir] = await tx
        .select({ userId: crewMembers.userId })
        .from(crewMembers)
        .where(and(eq(crewMembers.crewId, crewId), ne(crewMembers.userId, userId)))
        .orderBy(asc(crewMembers.joinedAt))
        .limit(1);
      if (heir) {
        await tx
          .update(crewMembers)
          .set({ role: "owner" })
          .where(and(eq(crewMembers.crewId, crewId), eq(crewMembers.userId, heir.userId)));
      }
    }

    await tx
      .update(plans)
      .set({ cancelledAt: new Date() })
      .where(
        and(
          eq(plans.createdById, userId),
          isNull(plans.cancelledAt),
          or(
            gt(plans.endsAt, sql`now()`),
            and(eq(plans.repeatsWeekly, true), or(isNull(plans.repeatUntil), gt(plans.repeatUntil, sql`now()`))),
          ),
        ),
      );

    await tx.delete(availabilityBlocks).where(eq(availabilityBlocks.userId, userId));
    await tx.delete(rsvps).where(eq(rsvps.userId, userId));
    await tx.delete(planInvitees).where(eq(planInvitees.userId, userId));
    await tx.delete(crewMembers).where(eq(crewMembers.userId, userId));
    await tx.delete(sessions).where(eq(sessions.userId, userId));
    await tx.delete(authTokens).where(eq(authTokens.userId, userId));
    await tx
      .update(users)
      .set({
        name: "Deleted user",
        email: `deleted-${userId}@deleted.invalid`,
        passwordHash: null,
        emailVerifiedAt: null,
        color: "#9ca3af",
        deletedAt: new Date(),
      })
      .where(eq(users.id, userId));
  });
  return true;
}
