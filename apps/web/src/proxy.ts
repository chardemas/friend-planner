import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE, SESSION_TTL_MS } from "@lowkey/api/session-cookie";

/** Expose the requested path to server layouts so sign-in can bounce back to it (e.g. invite links). */
export function proxy(request: NextRequest) {
  const headers = new Headers(request.headers);
  headers.set("x-pathname", request.nextUrl.pathname + request.nextUrl.search);
  const response = NextResponse.next({ request: { headers } });
  // Keep the cookie's lifetime in step with the server-side session, which slides forward while it's used.
  const session = request.cookies.get(SESSION_COOKIE)?.value;
  if (session) {
    response.cookies.set(SESSION_COOKIE, session, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: SESSION_TTL_MS / 1000,
    });
  }
  return response;
}

export const config = { matcher: ["/((?!api|_next|favicon.ico).*)"] };
