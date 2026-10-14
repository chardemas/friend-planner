"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { signIn } from "@lowkey/api";
import { SESSION_COOKIE, createSessionToken } from "@lowkey/api/session";
import { db } from "@lowkey/db";
import { signInInput } from "@lowkey/validators";

export type SignInState = { step: "email" | "name"; email?: string; error?: string };

function safeNext(next: FormDataEntryValue | null) {
  const s = typeof next === "string" ? next : "";
  return s.startsWith("/") && !s.startsWith("//") ? s : "/";
}

export async function signInAction(_prev: SignInState, form: FormData): Promise<SignInState> {
  const parsed = signInInput.safeParse({
    email: form.get("email"),
    name: form.get("name") || undefined,
    timezone: form.get("timezone") || undefined,
  });
  if (!parsed.success) return { step: form.get("name") !== null ? "name" : "email", email: String(form.get("email") ?? ""), error: parsed.error.issues[0]?.message };

  const { user } = await signIn(db, parsed.data);
  if (!user) return { step: "name", email: parsed.data.email };

  (await cookies()).set(SESSION_COOKIE, createSessionToken(user.id), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 90,
  });
  redirect(safeNext(form.get("next")));
}

export async function signOutAction() {
  (await cookies()).delete(SESSION_COOKIE);
  redirect("/signin");
}
