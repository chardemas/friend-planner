"use server";

import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { after } from "next/server";
import { SESSION_COOKIE, SESSION_TTL_MS, createSession, revokeAllSessions, revokeSession } from "@lowkey/api/session";
import { db } from "@lowkey/db";
import { deleteAccountInput, forgotPasswordInput, resetPasswordInput, signInInput, signUpInput } from "@lowkey/validators";
import {
  authenticateUser,
  createAccount,
  deleteAccount,
  rateLimit,
  requestPasswordReset,
  resetPassword,
  sendVerificationEmail,
} from "@lowkey/api";
import { requireUserId } from "@/lib/session";

export type SignInState = { mode: "signin" | "signup"; error?: string };
export type FormState = { error?: string; message?: string };

const TOO_MANY = "Too many attempts. Wait a few minutes and try again.";
const MINUTE = 60;
const HOUR = 60 * MINUTE;

function safeNext(next: FormDataEntryValue | null) {
  const s = typeof next === "string" ? next : "";
  return s.startsWith("/") && !s.startsWith("//") ? s : "/";
}

/** Client IP. On Vercel the platform sets x-forwarded-for itself, so it can't be spoofed by the caller. */
async function clientIp() {
  const h = await headers();
  return h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || "unknown";
}

async function setSession(userId: string) {
  const { token } = await createSession(db, userId);
  (await cookies()).set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_TTL_MS / 1000,
  });
}

export async function signInAction(_prev: SignInState, form: FormData): Promise<SignInState> {
  const mode = form.get("mode") === "signup" ? "signup" : "signin";
  const input = {
    email: form.get("email"),
    password: form.get("password"),
    name: form.get("name") || undefined,
    timezone: form.get("timezone") || undefined,
  };
  const ip = await clientIp();

  if (mode === "signup") {
    const parsed = signUpInput.safeParse(input);
    if (!parsed.success) return { mode, error: parsed.error.issues[0]?.message };
    if (!(await rateLimit(db, `signup:ip:${ip}`, 5, HOUR))) return { mode, error: TOO_MANY };
    const user = await createAccount(db, parsed.data);
    if (!user) return { mode, error: "An account with that email already exists. Sign in instead." };
    after(() => sendVerificationEmail(db, user.id));
    await setSession(user.id);
  } else {
    const parsed = signInInput.safeParse(input);
    if (!parsed.success) return { mode, error: parsed.error.issues[0]?.message };
    const allowed =
      (await rateLimit(db, `signin:ip:${ip}`, 30, 15 * MINUTE)) &&
      (await rateLimit(db, `signin:email:${parsed.data.email}`, 10, 15 * MINUTE));
    if (!allowed) return { mode, error: TOO_MANY };
    const user = await authenticateUser(db, parsed.data);
    if (!user) return { mode, error: "Email or password is incorrect." };
    await setSession(user.id);
  }

  redirect(safeNext(form.get("next")));
}

export async function signOutAction() {
  const jar = await cookies();
  await revokeSession(db, jar.get(SESSION_COOKIE)?.value);
  jar.delete(SESSION_COOKIE);
  redirect("/signin");
}

export async function signOutOtherDevicesAction(): Promise<FormState> {
  const userId = await requireUserId();
  await revokeAllSessions(db, userId, (await cookies()).get(SESSION_COOKIE)?.value);
  return { message: "Signed out everywhere else." };
}

export async function forgotPasswordAction(_prev: FormState, form: FormData): Promise<FormState> {
  const parsed = forgotPasswordInput.safeParse({ email: form.get("email") });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message };
  const allowed =
    (await rateLimit(db, `forgot:ip:${await clientIp()}`, 10, HOUR)) &&
    (await rateLimit(db, `forgot:email:${parsed.data.email}`, 3, HOUR));
  if (!allowed) return { error: TOO_MANY };
  // Runs after the response so the reply takes the same time whether or not the account exists.
  after(() => requestPasswordReset(db, parsed.data.email));
  return { message: "If there's an account for that email, a reset link is on its way. It works for 1 hour." };
}

export async function resetPasswordAction(_prev: FormState, form: FormData): Promise<FormState> {
  const parsed = resetPasswordInput.safeParse({ token: form.get("token"), password: form.get("password") });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message };
  if (!(await rateLimit(db, `reset:ip:${await clientIp()}`, 10, HOUR))) return { error: TOO_MANY };
  const userId = await resetPassword(db, parsed.data.token, parsed.data.password);
  if (!userId) return { error: "This reset link has expired or was already used. Request a new one." };
  await setSession(userId);
  redirect("/");
}

export async function resendVerificationAction(): Promise<FormState> {
  const userId = await requireUserId();
  if (!(await rateLimit(db, `verify:user:${userId}`, 3, HOUR))) return { error: TOO_MANY };
  await sendVerificationEmail(db, userId);
  return { message: "Sent. Check your inbox (and spam)." };
}

export async function deleteAccountAction(_prev: FormState, form: FormData): Promise<FormState> {
  const userId = await requireUserId();
  const parsed = deleteAccountInput.safeParse({ password: form.get("password"), confirm: form.get("confirm") });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message };
  if (!(await rateLimit(db, `delete:user:${userId}`, 5, 15 * MINUTE))) return { error: TOO_MANY };
  if (!(await deleteAccount(db, userId, parsed.data.password))) return { error: "That password isn't right." };
  (await cookies()).delete(SESSION_COOKIE);
  redirect("/signin?deleted=1");
}
