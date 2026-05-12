import { randomUUID } from "node:crypto";

import type { StudyDetail, StudyPlan } from "@motives-ai/contracts";

import type { AppDatabase } from "../../db/client.js";
import type { ResearchAiService } from "../../ai/research-service.js";
import {
  claimNextAnalysisJob,
  findDebriefReportBySessionId,
  listDebriefReportsForStudy,
  markAnalysisJobCancelled,
  markAnalysisJobCompleted,
  markAnalysisJobFailed,
  rescheduleAnalysisJob,
  upsertDebriefReport,
} from "../../db/repositories/analysis.js";
import {
  findParticipantProfileBySessionId,
  findSessionById,
} from "../../db/repositories/invites.js";
import {
  findCurrentApprovedPlan,
  getHighestPlanVersion,
  saveDraftPlan,
} from "../../db/repositories/plans.js";
import { listSessionAnnotations, listTranscriptForSession } from "../../db/repositories/public-interviews.js";
import {
  countSessions,
  findStudyById,
  findStudyTopics,
  touchStudy,
  upsertStudyAggregate,
} from "../../db/repositories/studies.js";
import { ApiError } from "../errors.js";
import {
  buildSessionDebriefModel,
  buildStudyTopicCoverageFromDebriefs,
} from "../study-analysis.js";
import {
  InvalidGeneratedStudyPlanError,
  validateGeneratedStudyPlanOutput,
} from "../study-plan-validation.js";
import {
  hasSubstantiveParticipantResponses,
  validateGeneratedSessionDebriefOutput,
} from "../session-debrief-validation.js";
import { hydrateStudyPlanDerivedFields } from "../study-plan-derived.js";
import {
  buildStudyObservation,
  computeAggregateCoverageValue,
  refreshStudyAggregate,
  refreshStudyStatus,
} from "../studies/state.js";
import { enqueueStudyAggregateJob } from "./queue.js";

class NonRetryableAnalysisError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "NonRetryableAnalysisError";
  }
}

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

function normalizeThemeLabels(themes: string[]) {
  return Array.from(
    new Set(
      themes
        .map((theme) => theme.trim())
        .filter(Boolean),
    ),
  );
}

function buildTopicCoverageFallback(topics: string[], counts: Awaited<ReturnType<typeof countSessions>>) {
  return topics.map((topic, index) => ({
    id: `${topic.toLowerCase().replace(/\s+/g, "-")}-${index}`,
    topic,
    status: counts.completed > 0
      ? "pending-analysis"
      : counts.active > 0 && index === 0
        ? "in-progress"
        : "not-explored",
    evidence: counts.active > 0 && index === 0 ? 1 : 0,
  })) satisfies StudyDetail["topicCoverage"];
}

function formatAnalysisError(error: unknown) {
  if (error instanceof Error && error.message) {
    return error.message;
  }

  return "Analysis job failed.";
}

export async function processNextAnalysisJob(
  db: AppDatabase,
  researchAiService: ResearchAiService,
): Promise<boolean> {
  const claimedAt = nowIso();
  const job = await claimNextAnalysisJob(db, claimedAt);

  if (!job) {
    return false;
  }

  try {
    const study = await findStudyById(db, job.studyId);

    if (!study) {
      await markAnalysisJobCancelled(db, job.id, "Study not found.", nowIso());
      return true;
    }

    if (study.status === "completed" || study.status === "archived") {
      await markAnalysisJobCancelled(
        db,
        job.id,
        study.status === "archived"
          ? "Study was archived before this analysis job could run."
          : "Study was ended before this analysis job could run.",
        nowIso(),
      );
      return true;
    }

    if (job.kind === "plan-generation") {
      const topics = await findStudyTopics(db, study.id);
      const generatedPlan = await researchAiService.generateStudyPlan({
        study,
        topics,
      });

      let validatedPlanOutput: ReturnType<typeof validateGeneratedStudyPlanOutput>;

      try {
        validatedPlanOutput = validateGeneratedStudyPlanOutput(generatedPlan.output);
      } catch (error) {
        if (error instanceof InvalidGeneratedStudyPlanError) {
          throw new ApiError(
            502,
            `Generated interview plan failed validation: ${error.message}`,
            "STUDY_PLAN_GENERATION_FAILED",
          );
        }

        throw error;
      }

      const plan = buildStudyPlan(study, {
        ...validatedPlanOutput,
        objective: validatedPlanOutput.objective.trim() || study.objective,
      });
      const versionNumber = (await getHighestPlanVersion(db, study.id, "draft")) + 1;
      const updatedAt = nowIso();

      await db.transaction(async (tx) => {
        await saveDraftPlan(tx, {
          createdAt: updatedAt,
          draftPlanId: createPrefixedId("plan"),
          plan,
          studyId: study.id,
          versionNumber,
        });
        await touchStudy(tx, study.id, updatedAt);
        await refreshStudyAggregate(tx, study.id);
        await markAnalysisJobCompleted(tx, job.id, updatedAt);
      });

      return true;
    }

    if (job.kind === "session-debrief") {
      const sessionId = job.sessionId ?? job.payload.sessionId;

      if (!sessionId) {
        await markAnalysisJobFailed(db, job.id, "Session id missing from debrief job.", nowIso());
        return true;
      }

      const [session, existingReport, plan, profile, transcript, annotations] =
        await Promise.all([
          findSessionById(db, sessionId),
          findDebriefReportBySessionId(db, sessionId),
          findCurrentApprovedPlan(db, study.id),
          findParticipantProfileBySessionId(db, sessionId),
          listTranscriptForSession(db, sessionId),
          listSessionAnnotations(db, sessionId),
        ]);

      if (!session || session.studyId !== study.id) {
        await markAnalysisJobCancelled(db, job.id, "Session not found.", nowIso());
        return true;
      }

      if (existingReport) {
        await db.transaction(async (tx) => {
          await enqueueStudyAggregateJob(tx, study.id, nowIso());
          await markAnalysisJobCompleted(tx, job.id, nowIso());
        });
        return true;
      }

      if (!plan) {
        throw new ApiError(409, "Approved plan not found for debrief generation.");
      }

      if (!profile) {
        throw new ApiError(409, "Participant profile not found for debrief generation.");
      }

      const participantLabel = `Participant ${String(session.participantNumber).padStart(2, "0")}`;

      if (!hasSubstantiveParticipantResponses(transcript)) {
        throw new NonRetryableAnalysisError(
          "Interview ended before the participant shared any substantive responses.",
        );
      }

      const generated = await researchAiService.generateSessionDebrief({
        annotations,
        participantLabel,
        participantResponses: profile.responses ?? {},
        plan,
        study,
        transcript,
      });
      validateGeneratedSessionDebriefOutput({
        output: generated.output,
        plan,
        transcript,
      });
      const content = buildSessionDebriefModel({
        output: generated.output,
        participantLabel,
        sessionId,
        studyId: study.id,
        studyObjective: study.objective,
        transcript,
      });
      const updatedAt = nowIso();

      await db.transaction(async (tx) => {
        await upsertDebriefReport(tx, {
          content,
          contradictions: generated.output.contradictions,
          createdAt: updatedAt,
          emotionSignal: generated.output.emotionSignal,
          model: generated.model,
          providerResponseId: generated.providerResponseId ?? null,
          sessionId,
          studyId: study.id,
          updatedAt,
        });
        await enqueueStudyAggregateJob(tx, study.id, updatedAt);
        await touchStudy(tx, study.id, updatedAt);
        await markAnalysisJobCompleted(tx, job.id, updatedAt);
      });

      return true;
    }

    const [plan, reports] = await Promise.all([
      findCurrentApprovedPlan(db, study.id),
      listDebriefReportsForStudy(db, study.id),
    ]);

    if (!plan) {
      throw new ApiError(409, "Approved plan not found for aggregate analysis.");
    }

    const topics = normalizeTopics(plan.topics);
    const debriefs = reports.map((report) => report.content);
    const aggregateSynthesis =
      debriefs.length > 0
        ? await researchAiService.synthesizeStudyAggregate({
            debriefs,
            plan,
            study,
          })
        : {
            model: "system-fallback",
            output: {
              observation: buildStudyObservation({
                completedSessions: 0,
                hasApprovedPlan: true,
                liveSessions: 0,
                status: study.status,
                totalSessions: 0,
              }),
              themes: topics,
            },
            providerResponseId: undefined,
          };
    const topicCoverage =
      debriefs.length > 0
        ? buildStudyTopicCoverageFromDebriefs(topics, debriefs)
        : buildTopicCoverageFallback(topics, {
            active: 0,
            completed: reports.length,
            live: 0,
            total: reports.length,
          });
    const contradictionCount = reports.reduce(
      (sum, report) => sum + report.contradictions.length,
      0,
    );
    const signalCount = reports.filter((report) => report.emotionSignal !== "low").length;
    const themes = normalizeThemeLabels(aggregateSynthesis.output.themes).slice(0, 3);
    const hiddenThemesCount = Math.max(
      normalizeThemeLabels(aggregateSynthesis.output.themes).length - themes.length,
      0,
    );
    const updatedAt = nowIso();

    await db.transaction(async (tx) => {
      await upsertStudyAggregate(tx, {
        studyId: study.id,
        coverage: computeAggregateCoverageValue(topicCoverage),
        contradictionCount,
        completedSessionCount: reports.length,
        signalCount,
        themes,
        hiddenThemesCount,
        observation: aggregateSynthesis.output.observation,
        topicCoverage,
        updatedAt,
      });
      await touchStudy(tx, study.id, updatedAt);
      await refreshStudyStatus(tx, study.id, updatedAt);
      await markAnalysisJobCompleted(tx, job.id, updatedAt);
    });

    return true;
  } catch (error) {
    const updatedAt = nowIso();
    const message = formatAnalysisError(error);

    if (error instanceof NonRetryableAnalysisError) {
      await markAnalysisJobFailed(db, job.id, message, updatedAt);
    } else if (job.attemptCount < 3) {
      const nextAttemptAt = new Date(Date.now() + job.attemptCount * 15_000).toISOString();
      await rescheduleAnalysisJob(db, job.id, {
        error: message,
        scheduledAt: nextAttemptAt,
        updatedAt,
      });
    } else {
      await markAnalysisJobFailed(db, job.id, message, updatedAt);
    }

    return true;
  }
}
