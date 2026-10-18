import { sql } from "drizzle-orm";
import { rateLimits, type DbOrTx } from "@lowkey/db";

/**
 * Fixed-window counter in Postgres: allows `limit` hits per `windowSeconds` for a key such as "signin:ip:1.2.3.4".
 * Returns false once the key is over its limit.
 */
export async function allow(db: DbOrTx, key: string, limit: number, windowSeconds: number) {
  const expired = sql`${rateLimits.windowStart} < now() - make_interval(secs => ${windowSeconds})`;
  const [row] = await db
    .insert(rateLimits)
    .values({ key, windowStart: sql`now()`, count: 1 })
    .onConflictDoUpdate({
      target: rateLimits.key,
      set: {
        windowStart: sql`case when ${expired} then now() else ${rateLimits.windowStart} end`,
        count: sql`case when ${expired} then 1 else ${rateLimits.count} + 1 end`,
      },
    })
    .returning({ count: rateLimits.count });
  // Occasionally clear out stale keys.
  if (Math.random() < 0.01) await db.delete(rateLimits).where(sql`${rateLimits.windowStart} < now() - interval '1 day'`);
  return row!.count <= limit;
}
