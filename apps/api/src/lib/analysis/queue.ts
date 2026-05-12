import { randomUUID } from "node:crypto";

import type { DatabaseExecutor } from "../../db/client.js";
import {
  createAnalysisJob,
  findDebriefReportBySessionId,
  findOpenAnalysisJob,
} from "../../db/repositories/analysis.js";

function isUniqueViolationError(error: unknown) {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === "23505"
  );
}

function createPrefixedId(prefix: string) {
  return `${prefix}_${randomUUID().replaceAll("-", "")}`;
}

export async function enqueueSessionDebriefJob(
  db: DatabaseExecutor,
  studyId: string,
  sessionId: string,
  scheduledAt: string,
) {
  const [existingReport, existingJob] = await Promise.all([
    findDebriefReportBySessionId(db, sessionId),
    findOpenAnalysisJob(db, {
      kind: "session-debrief",
      sessionId,
      studyId,
    }),
  ]);

  if (existingReport || existingJob) {
    return;
  }

  try {
    await createAnalysisJob(db, {
      attemptCount: 0,
      createdAt: scheduledAt,
      error: null,
      id: createPrefixedId("analysis"),
      kind: "session-debrief",
      lockedAt: null,
      payload: {
        sessionId,
        studyId,
      },
      scheduledAt,
      sessionId,
      status: "queued",
      studyId,
      updatedAt: scheduledAt,
    });
  } catch (error) {
    if (isUniqueViolationError(error)) {
      return;
    }

    throw error;
  }
}

export async function enqueueStudyPlanGenerationJob(
  db: DatabaseExecutor,
  studyId: string,
  scheduledAt: string,
) {
  const existingJob = await findOpenAnalysisJob(db, {
    kind: "plan-generation",
    studyId,
  });

  if (existingJob) {
    return false;
  }

  try {
    await createAnalysisJob(db, {
      attemptCount: 0,
      createdAt: scheduledAt,
      error: null,
      id: createPrefixedId("analysis"),
      kind: "plan-generation",
      lockedAt: null,
      payload: {
        studyId,
      },
      scheduledAt,
      sessionId: null,
      status: "queued",
      studyId,
      updatedAt: scheduledAt,
    });
  } catch (error) {
    if (isUniqueViolationError(error)) {
      return false;
    }

    throw error;
  }

  return true;
}

export async function enqueueStudyAggregateJob(
  db: DatabaseExecutor,
  studyId: string,
  scheduledAt: string,
) {
  const existingJob = await findOpenAnalysisJob(db, {
    kind: "study-aggregate",
    studyId,
  });

  if (existingJob) {
    return;
  }

  try {
    await createAnalysisJob(db, {
      attemptCount: 0,
      createdAt: scheduledAt,
      error: null,
      id: createPrefixedId("analysis"),
      kind: "study-aggregate",
      lockedAt: null,
      payload: {
        studyId,
      },
      scheduledAt,
      sessionId: null,
      status: "queued",
      studyId,
      updatedAt: scheduledAt,
    });
  } catch (error) {
    if (isUniqueViolationError(error)) {
      return;
    }

    throw error;
  }
}
