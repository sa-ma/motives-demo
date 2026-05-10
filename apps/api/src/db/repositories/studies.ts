import { and, asc, desc, eq, ilike, inArray, or, sql } from "drizzle-orm";

import type {
  ListStudiesQuery,
  ParticipantIntakeField,
  StudyStatus,
} from "@motives-ai/contracts";

import type { DatabaseExecutor } from "../client.js";
import {
  participantField,
  study,
  studyAggregate,
  studyTopic,
  interviewSession,
  type StudyAggregateRow,
  type StudyRow,
  type InterviewSessionRow,
} from "../schema.js";

export async function findStudyById(db: DatabaseExecutor, studyId: string) {
  return db.query.study.findFirst({
    where: eq(study.id, studyId),
  });
}

export async function listStudiesOrdered(
  db: DatabaseExecutor,
  query: ListStudiesQuery = {},
) {
  const conditions = [];
  const search = query.q?.trim();

  if (query.status === "active") {
    conditions.push(inArray(study.status, ["interviewing", "analyzing"]));
  } else if (query.status) {
    conditions.push(eq(study.status, query.status));
  }

  if (search) {
    const pattern = `%${search}%`;
    conditions.push(
      or(
        ilike(study.title, pattern),
        ilike(study.objective, pattern),
        ilike(study.audience, pattern),
        ilike(study.context, pattern),
      )!,
    );
  }

  return db.query.study.findMany({
    orderBy:
      query.sort === "updated-asc"
        ? [asc(study.updatedAt), asc(study.createdAt)]
        : [desc(study.updatedAt), desc(study.createdAt)],
    where: conditions.length > 0 ? and(...conditions) : undefined,
  });
}

export async function findStudyTopics(db: DatabaseExecutor, studyId: string) {
  const rows = await db
    .select({ label: studyTopic.label })
    .from(studyTopic)
    .where(eq(studyTopic.studyId, studyId))
    .orderBy(studyTopic.sortOrder);

  return rows.map((row) => row.label);
}

export async function findParticipantFields(
  db: DatabaseExecutor,
  studyId: string,
): Promise<ParticipantIntakeField[]> {
  const rows = await db
    .select()
    .from(participantField)
    .where(eq(participantField.studyId, studyId))
    .orderBy(participantField.sortOrder);

  return rows.map((row) => ({
    id: row.fieldKey,
    label: row.label,
    type: row.type,
    options: row.options ?? undefined,
    required: row.required,
    placeholder: row.placeholder ?? undefined,
    helperText: row.helperText ?? undefined,
  }));
}

export async function findStudyAggregate(db: DatabaseExecutor, studyId: string) {
  return db.query.studyAggregate.findFirst({
    where: eq(studyAggregate.studyId, studyId),
  });
}

export async function createUniqueStudyId(db: DatabaseExecutor, title: string) {
  const base = title
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .slice(0, 64) || "study";

  let candidate = base;
  let suffix = 2;

  for (;;) {
    const existing = await db.query.study.findFirst({
      columns: { id: true },
      where: eq(study.id, candidate),
    });

    if (!existing) {
      return candidate;
    }

    candidate = `${base}-${suffix}`;
    suffix += 1;
  }
}

export async function insertStudy(db: DatabaseExecutor, values: typeof study.$inferInsert) {
  await db.insert(study).values(values);
}

export async function insertStudyTopics(
  db: DatabaseExecutor,
  values: Array<typeof studyTopic.$inferInsert>,
) {
  if (values.length === 0) {
    return;
  }

  await db.insert(studyTopic).values(values);
}

export async function insertParticipantFields(
  db: DatabaseExecutor,
  values: Array<typeof participantField.$inferInsert>,
) {
  if (values.length === 0) {
    return;
  }

  await db.insert(participantField).values(values);
}

export async function listSessionsForStudy(db: DatabaseExecutor, studyId: string) {
  return db.query.interviewSession.findMany({
    where: eq(interviewSession.studyId, studyId),
    orderBy: [desc(interviewSession.createdAt)],
  });
}

export async function countSessions(db: DatabaseExecutor, studyId: string) {
  const rows = await db
    .select({
      total: sql<number>`count(*)`.mapWith(Number),
      completed: sql<number>`
        coalesce(sum(case when ${interviewSession.sessionStatus} = 'complete' then 1 else 0 end), 0)
      `.mapWith(Number),
      live: sql<number>`
        coalesce(sum(case when ${interviewSession.sessionStatus} = 'room' then 1 else 0 end), 0)
      `.mapWith(Number),
    })
    .from(interviewSession)
    .where(eq(interviewSession.studyId, studyId));

  const row = rows[0];

  return {
    total: row?.total ?? 0,
    completed: row?.completed ?? 0,
    live: row?.live ?? 0,
  };
}

export async function touchStudy(
  db: DatabaseExecutor,
  studyId: string,
  updatedAt: string,
) {
  await db
    .update(study)
    .set({ updatedAt })
    .where(eq(study.id, studyId));
}

export async function updateStudyStatus(
  db: DatabaseExecutor,
  studyId: string,
  status: StudyStatus,
  updatedAt: string,
) {
  await db
    .update(study)
    .set({ status, updatedAt })
    .where(eq(study.id, studyId));
}

export async function upsertStudyAggregate(
  db: DatabaseExecutor,
  values: typeof studyAggregate.$inferInsert,
) {
  await db
    .insert(studyAggregate)
    .values(values)
    .onConflictDoUpdate({
      target: studyAggregate.studyId,
      set: {
        coverage: values.coverage,
        signalCount: values.signalCount,
        themes: values.themes,
        hiddenThemesCount: values.hiddenThemesCount,
        observation: values.observation,
        updatedAt: values.updatedAt,
      },
    });
}

export type StudyCounts = Awaited<ReturnType<typeof countSessions>>;
export type StudyRecord = StudyRow;
export type StudyAggregateRecord = StudyAggregateRow;
export type InterviewSessionRecord = InterviewSessionRow;
