import "server-only";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { SESSION_COOKIE, readSessionToken } from "@lowkey/api/session";

export async function currentUserId() {
  const jar = await cookies();
  return readSessionToken(jar.get(SESSION_COOKIE)?.value);
}

export async function requireUserId(next?: string) {
  const id = await currentUserId();
  if (!id) redirect(next ? `/signin?next=${encodeURIComponent(next)}` : "/signin");
  return id;
}
