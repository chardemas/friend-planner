import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Signed session tokens: `v1.<userId>.<signature>`.
 * The web app stores this in an httpOnly cookie; the mobile app can send it as a Bearer token.
 */
export const SESSION_COOKIE = "lowkey_session";

function secret() {
  const s = process.env.SESSION_SECRET;
  if (!s && process.env.NODE_ENV === "production") throw new Error("SESSION_SECRET must be set in production");
  return s ?? "dev-only-insecure-secret";
}

function sign(payload: string) {
  return createHmac("sha256", secret()).update(payload).digest("base64url");
}

export function createSessionToken(userId: string) {
  const payload = `v1.${userId}`;
  return `${payload}.${sign(payload)}`;
}

export function readSessionToken(token: string | undefined | null): string | null {
  if (!token) return null;
  const parts = token.split(".");
  if (parts.length !== 3 || parts[0] !== "v1") return null;
  const payload = `${parts[0]}.${parts[1]}`;
  const expected = Buffer.from(sign(payload));
  const actual = Buffer.from(parts[2]!);
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) return null;
  return parts[1]!;
}
