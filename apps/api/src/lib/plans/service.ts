import { randomUUID } from "node:crypto";

import type {
  ApprovePlanResponse,
  StudyPlan,
  StudyPlanGenerationResponse,
  UpdateStudyPlanInput,
} from "@motives-ai/contracts";

import type { AppDatabase, DatabaseExecutor } from "../../db/client.js";
import {
  findLatestAnalysisJob,
  findOpenAnalysisJob,
} from "../../db/repositories/analysis.js";
import {
  findCurrentPlan,
  findCurrentPlanVersion,
  getHighestPlanVersion,
  replaceCurrentApprovedPlan,
  saveDraftPlan,
  updateDraftPlanContent,
} from "../../db/repositories/plans.js";
import { findStudyById, touchStudy } from "../../db/repositories/studies.js";
import { enqueueStudyPlanGenerationJob } from "../analysis/queue.js";
import { ApiError } from "../errors.js";
import { refreshStudyAggregate } from "../studies/state.js";
import { InvalidGeneratedStudyPlanError, validateStudyPlan } from "../study-plan-validation.js";
import { hydrateStudyPlanDerivedFields } from "../study-plan-derived.js";

function nowIso() {
  return new Date().toISOString();
}

function createPrefixedId(prefix: string) {
  return `${prefix}_${randomUUID().replaceAll("-", "")}`;
}

function normalizeTopics(topics: string[]) {
  const seen = new Set<string>();

  return topics
    .map((topic) => topic.trim())
    .filter((topic) => {
      if (!topic) {
        return false;
      }

      const normalized = topic.toLowerCase();

      if (seen.has(normalized)) {
        return false;
      }

      seen.add(normalized);
      return true;
    });
}

function ensureStudyPlanIsValid(plan: StudyPlan, action: string) {
  try {
    validateStudyPlan(plan);
  } catch (error) {
    if (error instanceof InvalidGeneratedStudyPlanError) {
      throw new ApiError(
        409,
        `The current study plan is invalid and cannot ${action}. Regenerate the plan and try again.`,
        "STUDY_PLAN_INVALID",
      );
    }

    throw error;
  }
}

function buildStudyPlan(
  study: Awaited<ReturnType<typeof findStudyById>> extends infer T
    ? NonNullable<T>
    : never,
  generatedPlan: Omit<StudyPlan, "studyId" | "subtitle" | "title">,
): StudyPlan {
  return hydrateStudyPlanDerivedFields({
    studyId: study.id,
    title: study.title,
    subtitle: "AI-generated plan tailored to your research objective",
    ...generatedPlan,
    exampleProbes: normalizeTopics(generatedPlan.exampleProbes),
    hypotheses: normalizeTopics(generatedPlan.hypotheses),
    mustCoverAreas: normalizeTopics(generatedPlan.mustCoverAreas),
    probingStrategy: normalizeTopics(generatedPlan.probingStrategy),
    thingsToAvoid: normalizeTopics(generatedPlan.thingsToAvoid),
    topics: normalizeTopics(generatedPlan.topics),
  });
}

function ensureStudyNotEnded(
  study: Awaited<ReturnType<typeof findStudyById>> extends infer T ? NonNullable<T> : never,
  actionLabel: string,
) {
  if (study.status === "completed" || study.status === "archived") {
    throw new ApiError(
      409,
      `This study has been ${study.status === "archived" ? "archived" : "ended"} and can no longer ${actionLabel}.`,
      study.status === "archived" ? "STUDY_ARCHIVED" : "STUDY_COMPLETED",
    );
  }
}

async function buildStudyPlanGenerationResponse(
  db: DatabaseExecutor,
  studyId: string,
): Promise<StudyPlanGenerationResponse> {
  const [plan, latestJob, openJob] = await Promise.all([
    findCurrentPlan(db, studyId),
    findLatestAnalysisJob(db, {
      kind: "plan-generation",
      studyId,
    }),
    findOpenAnalysisJob(db, {
      kind: "plan-generation",
      studyId,
    }),
  ]);

  if (openJob) {
    return {
      hasPlan: Boolean(plan),
      status: "pending",
      studyId,
    };
  }

  if (latestJob?.status === "failed") {
    return {
      error: latestJob.error ?? "Plan generation failed.",
      hasPlan: Boolean(plan),
      status: "failed",
      studyId,
    };
  }

  if (plan) {
    return {
      hasPlan: true,
      status: "ready",
      studyId,
    };
  }

  return {
    hasPlan: false,
    status: "not-started",
    studyId,
  };
}

export async function getStudyPlan(
  db: AppDatabase,
  studyId: string,
): Promise<StudyPlan> {
  const study = await findStudyById(db, studyId);

  if (!study) {
    throw new ApiError(404, "Study not found.");
  }

  const plan = await findCurrentPlan(db, studyId);

  if (!plan) {
    throw new ApiError(404, "Study plan not found.", "STUDY_PLAN_NOT_FOUND");
  }

  return plan;
}

export async function getStudyPlanGenerationStatus(
  db: AppDatabase,
  studyId: string,
): Promise<StudyPlanGenerationResponse> {
  const study = await findStudyById(db, studyId);

  if (!study) {
    throw new ApiError(404, "Study not found.", "STUDY_NOT_FOUND");
  }

  return buildStudyPlanGenerationResponse(db, studyId);
}

export async function requestStudyPlanGeneration(
  db: AppDatabase,
  studyId: string,
): Promise<StudyPlanGenerationResponse> {
  const study = await findStudyById(db, studyId);

  if (!study) {
    throw new ApiError(404, "Study not found.", "STUDY_NOT_FOUND");
  }

  ensureStudyNotEnded(study, "generate a new plan");
  const scheduledAt = nowIso();

  await db.transaction(async (tx) => {
    const createdJob = await enqueueStudyPlanGenerationJob(tx, studyId, scheduledAt);

    if (createdJob) {
      await touchStudy(tx, studyId, scheduledAt);
    }
  });

  return buildStudyPlanGenerationResponse(db, studyId);
}

export async function updateStudyPlan(
  db: AppDatabase,
  studyId: string,
  input: UpdateStudyPlanInput,
): Promise<StudyPlan> {
  const study = await findStudyById(db, studyId);

  if (!study) {
    throw new ApiError(404, "Study not found.", "STUDY_NOT_FOUND");
  }

  ensureStudyNotEnded(study, "be edited");

  const draftRow = await findCurrentPlanVersion(db, studyId, "draft");

  if (!draftRow) {
    throw new ApiError(409, "A draft plan must exist before it can be edited.", "DRAFT_PLAN_REQUIRED");
  }

  const existingPlan = hydrateStudyPlanDerivedFields(draftRow.content);

  const nextPlan = hydrateStudyPlanDerivedFields({
    ...existingPlan,
    ...input,
    topics: normalizeTopics(input.topics),
    mustCoverAreas: normalizeTopics(input.mustCoverAreas),
    thingsToAvoid: normalizeTopics(input.thingsToAvoid),
  });

  const updatedAt = nowIso();

  await db.transaction(async (tx) => {
    await updateDraftPlanContent(tx, draftRow.id, nextPlan, updatedAt);
    await touchStudy(tx, studyId, updatedAt);
    await refreshStudyAggregate(tx, studyId);
  });

  return nextPlan;
}

export async function approveStudyPlan(
  db: AppDatabase,
  studyId: string,
): Promise<ApprovePlanResponse> {
  const study = await findStudyById(db, studyId);

  if (!study) {
    throw new ApiError(404, "Study not found.", "STUDY_NOT_FOUND");
  }

  ensureStudyNotEnded(study, "approve a plan");

  const draftRow = await findCurrentPlanVersion(db, studyId, "draft");

  if (!draftRow) {
    throw new ApiError(409, "A draft plan is required before approval.", "DRAFT_PLAN_REQUIRED");
  }

  const draftPlan = hydrateStudyPlanDerivedFields(draftRow.content);
  ensureStudyPlanIsValid(draftPlan, "be approved");
  const approvedPlanVersionId = createPrefixedId("plan");
  const approvedAt = nowIso();
  const versionNumber = (await getHighestPlanVersion(db, studyId, "approved")) + 1;

  await db.transaction(async (tx) => {
    await replaceCurrentApprovedPlan(tx, {
      approvedAt,
      approvedPlanVersionId,
      plan: draftPlan,
      studyId,
      versionNumber,
    });

    await touchStudy(tx, studyId, approvedAt);
    await refreshStudyAggregate(tx, studyId);
  });

  return {
    studyId,
    approvedPlanVersionId,
    approvedAt,
  };
}
