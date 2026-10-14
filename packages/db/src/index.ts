import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { loadRootEnv } from "./env";
import * as schema from "./schema";

export * from "./schema";
export { schema };

const globalForDb = globalThis as unknown as { __lowkeySql?: postgres.Sql };

function connect() {
  if (!process.env.DATABASE_URL) loadRootEnv();
  const url = process.env.DATABASE_URL;
  if (!url) console.warn("[db] DATABASE_URL is not set. Copy .env.example to .env and fill it in.");
  // postgres() connects lazily, so a missing URL only fails when a query actually runs.
  // prepare:false keeps us compatible with Supabase's transaction pooler (pgbouncer).
  return postgres(url ?? "postgres://localhost:5432/lowkey", { prepare: false, max: 10, onnotice: () => {} });
}

/** Reuse one pool across Next.js hot reloads. */
const client = globalForDb.__lowkeySql ?? connect();
if (process.env.NODE_ENV !== "production") globalForDb.__lowkeySql = client;

export const db = drizzle(client, { schema });
export type Db = typeof db;
export type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];
export type DbOrTx = Db | Tx;
