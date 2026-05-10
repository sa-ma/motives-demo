import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

import * as schema from "./schema.js";

export type AppDatabase = NodePgDatabase<typeof schema>;
export type AppTransaction = Parameters<Parameters<AppDatabase["transaction"]>[0]>[0];
export type DatabaseExecutor = AppDatabase | AppTransaction;

export function createPgPool(databaseUrl: string) {
  return new Pool({
    connectionString: databaseUrl,
  });
}

export function createDatabaseClient(pool: Pool) {
  return drizzle(pool, { schema });
}

export async function checkDatabaseHealth(pool: Pool) {
  await pool.query("select 1");
}
