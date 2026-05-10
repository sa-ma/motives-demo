import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Pool } from "pg";

import { createDatabaseClient, createPgPool } from "./client.js";

export async function migrateDatabase(databaseUrl: string) {
  const pool = createPgPool(databaseUrl);

  try {
    const db = createDatabaseClient(pool);
    await migrate(db, {
      migrationsFolder: "drizzle",
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
        transcript_turn,
        participant_profile,
        interview_invite,
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
