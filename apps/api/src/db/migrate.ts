import { loadApiEnv } from "../lib/env.js";
import { migrateDatabase } from "./migrations.js";

loadApiEnv();

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  throw new Error("DATABASE_URL is required to run database migrations.");
}

void migrateDatabase(databaseUrl);
