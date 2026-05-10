import { asc, eq, sql } from "drizzle-orm";

import type { DatabaseExecutor } from "../client.js";
import { transcriptTurn } from "../schema.js";

export async function lockInterviewSession(
  db: DatabaseExecutor,
  sessionId: string,
) {
  await db.execute(sql`select id from interview_session where id = ${sessionId} for update`);
}

export async function listTranscriptForSession(
  db: DatabaseExecutor,
  sessionId: string,
) {
  return db.query.transcriptTurn.findMany({
    where: eq(transcriptTurn.sessionId, sessionId),
    orderBy: [asc(transcriptTurn.sortOrder)],
  });
}

export async function insertTranscriptTurn(
  db: DatabaseExecutor,
  values: typeof transcriptTurn.$inferInsert,
) {
  await db.insert(transcriptTurn).values(values);
}

export async function hasTranscriptTurns(
  db: DatabaseExecutor,
  sessionId: string,
) {
  const existing = await db.query.transcriptTurn.findFirst({
    columns: { id: true },
    where: eq(transcriptTurn.sessionId, sessionId),
  });

  return Boolean(existing);
}
