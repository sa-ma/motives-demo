import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Pool } from "pg";

import { createDatabaseClient, createPgPool } from "./client.js";

const migrationsFolder = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../../drizzle",
);

export async function migrateDatabase(databaseUrl: string) {
  const pool = createPgPool(databaseUrl);

  try {
    const db = createDatabaseClient(pool);
    await migrate(db, {
      migrationsFolder,
    });
  } finally {
    await pool.end();
  }
}

export async function truncateAllTables(databaseUrl: string) {
  const pool = new Pool({
    connectionString: databaseUrl,
  });

  try {
    await pool.query(`
      TRUNCATE TABLE
        analysis_job,
        debrief_report,
        session_annotation,
        transcript_turn,
        participant_profile,
        interview_invite,
        study_invite,
        interview_session,
        participant_field,
        study_aggregate,
        study_plan_version,
        study_topic,
        study
      RESTART IDENTITY CASCADE
    `);
  } finally {
    await pool.end();
  }
}
