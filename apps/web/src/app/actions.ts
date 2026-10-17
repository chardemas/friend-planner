"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { SESSION_COOKIE, createSessionToken } from "@lowkey/api/session";
import { db } from "@lowkey/db";
import { signInInput, signUpInput } from "@lowkey/validators";
import { authenticateUser, createAccount } from "@lowkey/api";

export type SignInState = { mode: "signin" | "signup"; error?: string };

function safeNext(next: FormDataEntryValue | null) {
  const s = typeof next === "string" ? next : "";
  return s.startsWith("/") && !s.startsWith("//") ? s : "/";
}

async function setSession(userId: string) {
  (await cookies()).set(SESSION_COOKIE, createSessionToken(userId), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 90,
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

  if (mode === "signup") {
    const parsed = signUpInput.safeParse(input);
    if (!parsed.success) return { mode, error: parsed.error.issues[0]?.message };
    const user = await createAccount(db, parsed.data);
    if (!user) return { mode, error: "An account with that email already exists. Sign in instead." };
    await setSession(user.id);
  } else {
    const parsed = signInInput.safeParse(input);
    if (!parsed.success) return { mode, error: parsed.error.issues[0]?.message };
    const user = await authenticateUser(db, parsed.data);
    if (!user) return { mode, error: "Email or password is incorrect." };
    await setSession(user.id);
  }

  redirect(safeNext(form.get("next")));
}

export async function signOutAction() {
  (await cookies()).delete(SESSION_COOKIE);
  redirect("/signin");
}
