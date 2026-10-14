import { randomBytes } from "node:crypto";
import { and, asc, eq, inArray, sql } from "drizzle-orm";
import { crewMembers, crews, users, type DbOrTx } from "@lowkey/db";
import { forbidden, notFound } from "../orpc";

const ALPHABET = "abcdefghjkmnpqrstuvwxyz23456789";
function inviteCode() {
  return [...randomBytes(8)].map((b) => ALPHABET[b % ALPHABET.length]).join("");
}

export async function assertMember(db: DbOrTx, crewId: string, userId: string) {
  const row = await db.query.crewMembers.findFirst({
    where: and(eq(crewMembers.crewId, crewId), eq(crewMembers.userId, userId)),
  });
  if (!row) throw notFound("Crew");
  return row;
}

export async function crewMemberIds(db: DbOrTx, crewId: string) {
  const rows = await db.select({ userId: crewMembers.userId }).from(crewMembers).where(eq(crewMembers.crewId, crewId));
  return rows.map((r) => r.userId);
}

/** Crew ids the user belongs to. */
export async function myCrewIds(db: DbOrTx, userId: string) {
  const rows = await db.select({ crewId: crewMembers.crewId }).from(crewMembers).where(eq(crewMembers.userId, userId));
  return rows.map((r) => r.crewId);
}

export async function listCrews(db: DbOrTx, userId: string) {
  const ids = await myCrewIds(db, userId);
  if (!ids.length) return [];
  return db
    .select({
      id: crews.id,
      name: crews.name,
      emoji: crews.emoji,
      memberCount: sql<number>`(select count(*)::int from ${crewMembers} where ${crewMembers.crewId} = ${crews.id})`,
    })
    .from(crews)
    .where(inArray(crews.id, ids))
    .orderBy(asc(crews.name));
}

export async function getCrew(db: DbOrTx, userId: string, crewId: string) {
  const me = await assertMember(db, crewId, userId);
  const crew = await db.query.crews.findFirst({ where: eq(crews.id, crewId) });
  if (!crew) throw notFound("Crew");
  const members = await db
    .select({ id: users.id, name: users.name, color: users.color, role: crewMembers.role })
    .from(crewMembers)
    .innerJoin(users, eq(users.id, crewMembers.userId))
    .where(eq(crewMembers.crewId, crewId))
    .orderBy(asc(users.name));
  return { ...crew, myRole: me.role, members };
}

export async function createCrew(db: DbOrTx, userId: string, input: { name: string; emoji: string }) {
  const [crew] = await db
    .insert(crews)
    .values({ name: input.name, emoji: input.emoji || "🫶", inviteCode: inviteCode(), createdById: userId })
    .returning();
  await db.insert(crewMembers).values({ crewId: crew!.id, userId, role: "owner" });
  return crew!;
}

export async function previewInvite(db: DbOrTx, code: string) {
  const crew = await db.query.crews.findFirst({ where: eq(crews.inviteCode, code.toLowerCase()) });
  if (!crew) throw notFound("Invite");
  const [count] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(crewMembers)
    .where(eq(crewMembers.crewId, crew.id));
  return { id: crew.id, name: crew.name, emoji: crew.emoji, memberCount: count?.n ?? 0 };
}

export async function joinCrew(db: DbOrTx, userId: string, code: string) {
  const crew = await previewInvite(db, code);
  await db.insert(crewMembers).values({ crewId: crew.id, userId }).onConflictDoNothing();
  return crew;
}

export async function leaveCrew(db: DbOrTx, userId: string, crewId: string) {
  await assertMember(db, crewId, userId);
  await db.delete(crewMembers).where(and(eq(crewMembers.crewId, crewId), eq(crewMembers.userId, userId)));
}

export async function resetInviteCode(db: DbOrTx, userId: string, crewId: string) {
  const me = await assertMember(db, crewId, userId);
  if (me.role !== "owner") throw forbidden("Only the crew owner can reset the invite link");
  const [crew] = await db.update(crews).set({ inviteCode: inviteCode() }).where(eq(crews.id, crewId)).returning();
  return crew!;
}
