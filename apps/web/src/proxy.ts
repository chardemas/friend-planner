import { NextResponse, type NextRequest } from "next/server";

/** Expose the requested path to server layouts so sign-in can bounce back to it (e.g. invite links). */
export function proxy(request: NextRequest) {
  const headers = new Headers(request.headers);
  headers.set("x-pathname", request.nextUrl.pathname + request.nextUrl.search);
  return NextResponse.next({ request: { headers } });
}

export const config = { matcher: ["/((?!api|_next|favicon.ico).*)"] };
