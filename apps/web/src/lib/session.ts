import "server-only";
import { cache } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { SESSION_COOKIE, resolveSession } from "@lowkey/api/session";
import { db } from "@lowkey/db";

/** One session lookup per request, however many layouts and pages ask. */
export const currentUserId = cache(async () => {
  const jar = await cookies();
  return resolveSession(db, jar.get(SESSION_COOKIE)?.value);
});

export async function requireUserId(next?: string) {
  const id = await currentUserId();
  if (!id) redirect(next ? `/signin?next=${encodeURIComponent(next)}` : "/signin");
  return id;
}
