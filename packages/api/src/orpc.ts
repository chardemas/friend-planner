import { ORPCError, os } from "@orpc/server";
import type { Db } from "@lowkey/db";

export interface Context {
  db: Db;
  /** Set when the request carries a valid session. */
  userId: string | null;
}

export const pub = os.$context<Context>();

export const authed = pub.use(({ context, next }) => {
  if (!context.userId) throw new ORPCError("UNAUTHORIZED", { message: "Sign in first" });
  return next({ context: { userId: context.userId } });
});

export const notFound = (what: string) => new ORPCError("NOT_FOUND", { message: `${what} not found` });
export const forbidden = (message: string) => new ORPCError("FORBIDDEN", { message });
export const badRequest = (message: string) => new ORPCError("BAD_REQUEST", { message });
