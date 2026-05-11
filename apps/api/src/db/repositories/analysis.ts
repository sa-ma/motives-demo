import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";

import type { AppDatabase, DatabaseExecutor } from "../client.js";
import { analysisJob, debriefReport } from "../schema.js";

export async function findDebriefReportBySessionId(
  db: DatabaseExecutor,
  sessionId: string,
) {
  return db.query.debriefReport.findFirst({
    where: eq(debriefReport.sessionId, sessionId),
  });
}

export async function listDebriefReportsForStudy(
  db: DatabaseExecutor,
  studyId: string,
) {
  return db.query.debriefReport.findMany({
    orderBy: [desc(debriefReport.updatedAt)],
    where: eq(debriefReport.studyId, studyId),
  });
}

export async function upsertDebriefReport(
  db: DatabaseExecutor,
  values: typeof debriefReport.$inferInsert,
) {
  await db
    .insert(debriefReport)
    .values(values)
    .onConflictDoUpdate({
      target: debriefReport.sessionId,
      set: {
        content: values.content,
        contradictions: values.contradictions,
        emotionSignal: values.emotionSignal,
        model: values.model,
        providerResponseId: values.providerResponseId,
        updatedAt: values.updatedAt,
      },
    });
}

export async function createAnalysisJob(
  db: DatabaseExecutor,
  values: typeof analysisJob.$inferInsert,
) {
  const [row] = await db.insert(analysisJob).values(values).returning();

  if (!row) {
    throw new Error("Failed to create analysis job.");
  }

  return row;
}

export async function findOpenAnalysisJob(
  db: DatabaseExecutor,
  options: {
    kind: "session-debrief" | "study-aggregate";
    sessionId?: string;
    studyId: string;
  },
) {
  const conditions = [
    eq(analysisJob.kind, options.kind),
    eq(analysisJob.studyId, options.studyId),
    inArray(analysisJob.status, ["queued", "running"]),
  ];

  if (options.sessionId) {
    conditions.push(eq(analysisJob.sessionId, options.sessionId));
  }

  return db.query.analysisJob.findFirst({
    orderBy: [desc(analysisJob.createdAt)],
    where: and(...conditions),
  });
}

export async function findLatestAnalysisJob(
  db: DatabaseExecutor,
  options: {
    kind: "session-debrief" | "study-aggregate";
    sessionId?: string;
    studyId: string;
  },
) {
  const conditions = [
    eq(analysisJob.kind, options.kind),
    eq(analysisJob.studyId, options.studyId),
  ];

  if (options.sessionId) {
    conditions.push(eq(analysisJob.sessionId, options.sessionId));
  }

  return db.query.analysisJob.findFirst({
    orderBy: [desc(analysisJob.updatedAt), desc(analysisJob.createdAt)],
    where: and(...conditions),
  });
}

export async function listLatestAnalysisJobsForSessions(
  db: DatabaseExecutor,
  options: {
    kind: "session-debrief" | "study-aggregate";
    sessionIds: string[];
    studyId: string;
  },
) {
  if (options.sessionIds.length === 0) {
    return [];
  }

  return db.query.analysisJob.findMany({
    orderBy: [
      asc(analysisJob.sessionId),
      desc(analysisJob.updatedAt),
      desc(analysisJob.createdAt),
    ],
    where: and(
      eq(analysisJob.kind, options.kind),
      eq(analysisJob.studyId, options.studyId),
      inArray(analysisJob.sessionId, options.sessionIds),
    ),
  });
}

export async function cancelQueuedAnalysisJobsForStudy(
  db: DatabaseExecutor,
  studyId: string,
  updatedAt: string,
) {
  await db
    .update(analysisJob)
    .set({
      error: "Cancelled because the study was ended.",
      status: "cancelled",
      updatedAt,
    })
    .where(
      and(eq(analysisJob.studyId, studyId), eq(analysisJob.status, "queued")),
    );
}

export async function claimNextAnalysisJob(db: AppDatabase, updatedAt: string) {
  const result = await db.transaction(async (tx) => {
    const claimed = await tx.execute(sql<{ id: string }>`
      update analysis_job
      set
        status = 'running',
        attempt_count = analysis_job.attempt_count + 1,
        locked_at = ${updatedAt}::timestamptz,
        updated_at = ${updatedAt}::timestamptz
      where id = (
        select id
        from analysis_job
        where status = 'queued'
          and scheduled_at <= ${updatedAt}::timestamptz
        order by scheduled_at asc, created_at asc
        for update skip locked
        limit 1
      )
      returning id
    `);
    const jobId = claimed.rows[0]?.id;

    if (typeof jobId !== "string") {
      return null;
    }

    return tx.query.analysisJob.findFirst({
      where: eq(analysisJob.id, jobId),
    });
  });

  return result ?? null;
}

export async function markAnalysisJobCompleted(
  db: DatabaseExecutor,
  jobId: string,
  updatedAt: string,
) {
  await db
    .update(analysisJob)
    .set({
      error: null,
      lockedAt: null,
      status: "completed",
      updatedAt,
    })
    .where(eq(analysisJob.id, jobId));
}

export async function markAnalysisJobFailed(
  db: DatabaseExecutor,
  jobId: string,
  error: string,
  updatedAt: string,
) {
  await db
    .update(analysisJob)
    .set({
      error,
      lockedAt: null,
      status: "failed",
      updatedAt,
    })
    .where(eq(analysisJob.id, jobId));
}

export async function markAnalysisJobCancelled(
  db: DatabaseExecutor,
  jobId: string,
  error: string,
  updatedAt: string,
) {
  await db
    .update(analysisJob)
    .set({
      error,
      lockedAt: null,
      status: "cancelled",
      updatedAt,
    })
    .where(eq(analysisJob.id, jobId));
}

export async function rescheduleAnalysisJob(
  db: DatabaseExecutor,
  jobId: string,
  options: {
    error: string;
    scheduledAt: string;
    updatedAt: string;
  },
) {
  await db
    .update(analysisJob)
    .set({
      error: options.error,
      lockedAt: null,
      scheduledAt: options.scheduledAt,
      status: "queued",
      updatedAt: options.updatedAt,
    })
    .where(eq(analysisJob.id, jobId));
}

export async function listQueuedAnalysisJobs(
  db: DatabaseExecutor,
) {
  return db.query.analysisJob.findMany({
    orderBy: [asc(analysisJob.scheduledAt), asc(analysisJob.createdAt)],
    where: eq(analysisJob.status, "queued"),
  });
}
