/**
 * Sessions, email links, rate limits, and account deletion against Postgres (DATABASE_URL). Skipped without a database.
 * Emails go to the console in tests (no RESEND_API_KEY), so links are read from there.
 */
import { randomUUID } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";

const hasDb = !!process.env.DATABASE_URL;

describe.skipIf(!hasDb)("accounts (integration)", async () => {
  const { db, users } = await import("@lowkey/db");
  const { eq } = await import("drizzle-orm");
  const session = await import("../session");
  const account = await import("./account");
  const { allow } = await import("./rate-limit");
  const { authenticateUser, createAccount } = await import("./users");
  const crews = await import("./crews");

  const tag = randomUUID().slice(0, 8);
  const PASSWORD = "first-password-123";
  const mk = async (name: string) =>
    (await createAccount(db, { email: `${name}-${tag}@test.dev`, name, password: PASSWORD }))!;

  /** Runs `fn` and returns the token from the last link it emailed. */
  async function emailedToken(fn: () => Promise<unknown>) {
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    await fn();
    const text = log.mock.calls.map((c) => String(c[0])).join("\n");
    log.mockRestore();
    const token = text.match(/token=([\w-]+)/g)?.pop()?.slice("token=".length);
    if (!token) throw new Error("no link was emailed");
    return token;
  }

  afterEach(() => vi.restoreAllMocks());

  it("creates, resolves, and revokes sessions", async () => {
    const u = await mk("sess");
    const a = await session.createSession(db, u.id);
    const b = await session.createSession(db, u.id);
    expect(await session.resolveSession(db, a.token)).toBe(u.id);
    expect(await session.resolveSession(db, "not-a-real-token")).toBeNull();

    await session.revokeAllSessions(db, u.id, b.token);
    expect(await session.resolveSession(db, a.token)).toBeNull();
    expect(await session.resolveSession(db, b.token)).toBe(u.id);

    await session.revokeSession(db, b.token);
    expect(await session.resolveSession(db, b.token)).toBeNull();
  });

  it("rate-limits per key", async () => {
    const key = `test:${tag}`;
    expect(await allow(db, key, 2, 60)).toBe(true);
    expect(await allow(db, key, 2, 60)).toBe(true);
    expect(await allow(db, key, 2, 60)).toBe(false);
    expect(await allow(db, `${key}:other`, 2, 60)).toBe(true);
  });

  it("verifies email with a single-use link", async () => {
    const u = await mk("verify");
    const token = await emailedToken(() => account.sendVerificationEmail(db, u.id));
    expect(await account.verifyEmail(db, token)).toBe(true);
    expect(await account.verifyEmail(db, token)).toBe(false);
    const after = await db.query.users.findFirst({ where: eq(users.id, u.id) });
    expect(after?.emailVerifiedAt).toBeInstanceOf(Date);
  });

  it("resets a password once and signs out every device", async () => {
    const u = await mk("reset");
    const old = await session.createSession(db, u.id);
    const stale = await emailedToken(() => account.requestPasswordReset(db, u.email.toUpperCase()));
    const token = await emailedToken(() => account.requestPasswordReset(db, u.email));
    expect(await account.resetPassword(db, stale, "replaced-link-123")).toBeNull();

    expect(await account.resetPassword(db, token, "second-password-456")).toBe(u.id);
    expect(await account.resetPassword(db, token, "third-password-789")).toBeNull();
    expect(await session.resolveSession(db, old.token)).toBeNull();
    expect(await authenticateUser(db, { email: u.email, password: PASSWORD })).toBeNull();
    expect((await authenticateUser(db, { email: u.email, password: "second-password-456" }))?.id).toBe(u.id);
  });

  it("does nothing for unknown emails", async () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    await account.requestPasswordReset(db, `nobody-${tag}@test.dev`);
    expect(log).not.toHaveBeenCalled();
  });

  it("deletes an account: needs the password, hands over crews, anonymizes the user", async () => {
    const owner = await mk("owner");
    const friend = await mk("friend");
    const crew = await crews.createCrew(db, owner.id, { name: "Test crew", emoji: "🧪" });
    await crews.joinCrew(db, friend.id, crew.inviteCode);
    const s = await session.createSession(db, owner.id);

    expect(await account.deleteAccount(db, owner.id, "wrong-password-000")).toBe(false);
    expect(await account.deleteAccount(db, owner.id, PASSWORD)).toBe(true);

    expect(await session.resolveSession(db, s.token)).toBeNull();
    expect(await authenticateUser(db, { email: owner.email, password: PASSWORD })).toBeNull();
    const gone = await db.query.users.findFirst({ where: eq(users.id, owner.id) });
    expect(gone).toMatchObject({ name: "Deleted user", passwordHash: null });
    expect(gone?.email).not.toContain("owner");

    const view = await crews.getCrew(db, friend.id, crew.id);
    expect(view.members).toEqual([expect.objectContaining({ id: friend.id, role: "owner" })]);

    // The address is free to sign up again.
    expect(await createAccount(db, { email: owner.email, name: "Again", password: PASSWORD })).not.toBeNull();
  });
});
