import { RPCHandler } from "@orpc/server/fetch";
import { onError } from "@orpc/server";
import { router } from "@lowkey/api";
import { SESSION_COOKIE, readSessionToken } from "@lowkey/api/session";
import { db } from "@lowkey/db";

const handler = new RPCHandler(router, {
  interceptors: [
    onError((error) => {
      if (process.env.NODE_ENV !== "production") console.error("[rpc]", error);
    }),
  ],
});

function sessionFrom(request: Request) {
  // Web uses the cookie; the mobile app can send `Authorization: Bearer <token>`.
  const bearer = request.headers.get("authorization")?.match(/^Bearer (.+)$/i)?.[1];
  const cookie = request.headers
    .get("cookie")
    ?.split(/;\s*/)
    .find((c) => c.startsWith(`${SESSION_COOKIE}=`))
    ?.slice(SESSION_COOKIE.length + 1);
  return readSessionToken(bearer ?? (cookie ? decodeURIComponent(cookie) : null));
}

async function handle(request: Request) {
  const { response } = await handler.handle(request, {
    prefix: "/api/rpc",
    context: { db, userId: sessionFrom(request) },
  });
  return response ?? new Response("Not found", { status: 404 });
}

export const GET = handle;
export const POST = handle;
export const dynamic = "force-dynamic";
