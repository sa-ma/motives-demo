import fp from "fastify-plugin";
import type { Pool } from "pg";

import {
  checkDatabaseHealth,
  createDatabaseClient,
  createPgPool,
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

type DatabasePluginOptions = {
  appBaseUrl: string;
  databaseUrl: string;
};

export const databasePlugin = fp<DatabasePluginOptions>(async (app, options) => {
  if (!options.databaseUrl) {
    throw new Error("DATABASE_URL is required to start the API.");
  }

  const pool = createPgPool(options.databaseUrl);
  const db = createDatabaseClient(pool);

  app.decorate("db", db);
  app.decorate("appBaseUrl", options.appBaseUrl);
  app.decorate("pgPool", pool);
  app.decorate("checkDatabaseHealth", async () => {
    await checkDatabaseHealth(pool);
  });

  app.addHook("onClose", async () => {
    await pool.end();
  });
});
