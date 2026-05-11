import fastifyPostgres from "@fastify/postgres";
import fp from "fastify-plugin";
import type { Pool } from "pg";

import {
  createDatabaseClient,
  type AppDatabase,
} from "../db/client.js";

declare module "fastify" {
  interface FastifyInstance {
    appBaseUrl: string;
    checkDatabaseHealth: () => Promise<void>;
    db: AppDatabase;
    pgPool: Pool;
  }
}

export const databasePlugin = fp(async (app) => {
  await app.register(fastifyPostgres, {
    connectionString: app.config.DATABASE_URL,
  });

  const pool = app.pg.pool;
  const db = createDatabaseClient(pool);

  app.decorate("db", db);
  app.decorate("appBaseUrl", app.config.APP_BASE_URL);
  app.decorate("pgPool", pool);
  app.decorate("checkDatabaseHealth", async () => {
    await app.pg.query("select 1");
  });
}, {
  dependencies: ["config"],
  name: "database",
});
