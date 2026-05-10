import { and, asc, desc, eq, gt, isNotNull, max, sql } from "drizzle-orm";

import type { DatabaseExecutor } from "../client.js";
import { sessionAnnotation, transcriptTurn } from "../schema.js";

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
  const [row] = await db.insert(transcriptTurn).values(values).returning();

  if (!row) {
    throw new Error("Failed to insert transcript turn.");
  }

  return row;
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

export async function findTranscriptTurnByClientMessageId(
  db: DatabaseExecutor,
  sessionId: string,
  clientMessageId: string,
) {
  return db.query.transcriptTurn.findFirst({
    where: and(
      eq(transcriptTurn.sessionId, sessionId),
      eq(transcriptTurn.clientMessageId, clientMessageId),
    ),
  });
}

export async function findNextTranscriptTurn(
  db: DatabaseExecutor,
  sessionId: string,
  sortOrder: number,
) {
  return db.query.transcriptTurn.findFirst({
    orderBy: [asc(transcriptTurn.sortOrder)],
    where: and(
      eq(transcriptTurn.sessionId, sessionId),
      gt(transcriptTurn.sortOrder, sortOrder),
    ),
  });
}

export async function getNextTranscriptSortOrder(
  db: DatabaseExecutor,
  sessionId: string,
) {
  const [result] = await db
    .select({
      maxSortOrder: max(transcriptTurn.sortOrder),
    })
    .from(transcriptTurn)
    .where(eq(transcriptTurn.sessionId, sessionId));

  return (result?.maxSortOrder ?? -1) + 1;
}

export async function insertSessionAnnotation(
  db: DatabaseExecutor,
  values: typeof sessionAnnotation.$inferInsert,
) {
  const [row] = await db.insert(sessionAnnotation).values(values).returning();

  if (!row) {
    throw new Error("Failed to insert session annotation.");
  }

  return row;
}

export async function findLatestSessionAnnotation(
  db: DatabaseExecutor,
  sessionId: string,
) {
  return db.query.sessionAnnotation.findFirst({
    orderBy: [desc(sessionAnnotation.createdAt)],
    where: eq(sessionAnnotation.sessionId, sessionId),
  });
}

export async function findAnnotationByAssistantTurnId(
  db: DatabaseExecutor,
  assistantTurnId: string,
) {
  return db.query.sessionAnnotation.findFirst({
    where: eq(sessionAnnotation.assistantTurnId, assistantTurnId),
  });
}
