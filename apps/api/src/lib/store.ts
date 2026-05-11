import { randomUUID } from "node:crypto";

import type {
  ArchiveStudyResponse,
  CreateInviteResponse,
  CreateStudyInput,
  CreateStudyResponse,
  EndStudyResponse,
  InterviewInvitePayload,
  InterviewMessage,
  InterviewMessageMetadata,
  InterviewProgressState,
  InterviewSessionState,
  InterviewSessionStatus,
  ListStudiesQuery,
  ParticipantIntakeField,
  ParticipantResponses,
  PublicInterviewActionInput,
  PublicInterviewActionResponse,
  PublicInterviewChatEvent,
  PublicInterviewRouteState,
  SessionDebrief,
  SessionDebriefResponse,
  StudyDetail,
  StudySessionItem,
  StudyStatus,
  StudySummary,
  UpdateStudyPlanInput,
} from "@motives-ai/contracts";
import type { ApprovePlanResponse, StudyPlan } from "@motives-ai/contracts";

import type { AppDatabase, DatabaseExecutor } from "../db/client.js";
import type { ResearchAiService } from "../ai/research-service.js";
import {
  cancelQueuedAnalysisJobsForStudy,
  claimNextAnalysisJob,
  createAnalysisJob,
  findDebriefReportBySessionId,
  findLatestAnalysisJob,
  findOpenAnalysisJob,
  listDebriefReportsForStudy,
  listLatestAnalysisJobsForSessions,
  markAnalysisJobCancelled,
  markAnalysisJobCompleted,
  markAnalysisJobFailed,
  rescheduleAnalysisJob,
  upsertDebriefReport,
} from "../db/repositories/analysis.js";
import {
  createInterviewInvite,
  createInterviewSession,
  createInviteCode,
  createParticipantProfile,
  findLatestActiveInviteForStudy,
  findInviteWithSession,
  findParticipantProfileBySessionId,
  findSessionById,
  updateInterviewSessionState,
  updateParticipantProfileBySessionId,
} from "../db/repositories/invites.js";
import {
  findCurrentApprovedPlan,
  findCurrentDraftPlan,
  findCurrentPlan,
  findCurrentPlanVersion,
  getHighestPlanVersion,
  replaceCurrentApprovedPlan,
  saveDraftPlan,
  updateDraftPlanContent,
} from "../db/repositories/plans.js";
import {
  findAnnotationByAssistantTurnId,
  findLatestSessionAnnotation,
  listLatestSessionAnnotationsForSessions,
  findNextTranscriptTurn,
  findTranscriptTurnByClientMessageId,
  getNextTranscriptSortOrder,
  hasTranscriptTurns,
  insertTranscriptTurn,
  insertSessionAnnotation,
  listSessionAnnotations,
  listTranscriptForSession,
  listTranscriptForSessions,
  lockInterviewSession,
} from "../db/repositories/public-interviews.js";
import {
  countSessions,
  createUniqueStudyId,
  findParticipantFields,
  findStudyAggregate,
  findStudyById,
  findStudyTopics,
  insertParticipantFields,
  insertStudy,
  insertStudyTopics,
  listSessionsForStudy,
  listStudiesOrdered,
  touchStudy,
  upsertStudyAggregate,
  updateStudyStatus,
} from "../db/repositories/studies.js";
import { ApiError } from "./errors.js";
import {
  buildFallbackInterviewProgressState,
} from "./interview-progress.js";
import {
  buildSessionDebriefModel,
  buildStudyTopicCoverageFromDebriefs,
  debriefResponseFromRow,
} from "./study-analysis.js";
import {
  InvalidGeneratedStudyPlanError,
  validateGeneratedStudyPlanOutput,
  validateStudyPlan,
} from "./study-plan-validation.js";
import {
  hasSubstantiveParticipantResponses,
  validateGeneratedSessionDebriefOutput,
} from "./session-debrief-validation.js";
import {
  formatEstimatedInterviewDuration,
  hydrateStudyPlanDerivedFields,
} from "./study-plan-derived.js";

const DEFAULT_FORMAT_LABEL = "Conversational interview";
const DEFAULT_INTRO_COPY =
  "You're invited to take part in an AI-led research interview. The interviewer will ask about your experiences and opinions, and you can skip any question at any time.";
const DEFAULT_CONSENT_COPY =
  "I understand this is an AI-led research interview and my responses may be analyzed for research purposes.";
const PENDING_ANALYSIS_OBSERVATION =
  "Completed interviews are waiting for AI debrief analysis. Signals, contradictions, and topic coverage will appear after processing finishes.";
const FAILED_ANALYSIS_OBSERVATION =
  "We could not finish AI debrief analysis for the completed interviews yet. Retry the queue to populate signals, contradictions, and topic coverage.";

class NonRetryableAnalysisError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "NonRetryableAnalysisError";
  }
}

type PreparedPublicInterviewChatTurn =
  | {
      assistantMetadata: InterviewMessageMetadata;
      assistantTurn: InterviewMessage;
      kind: "replay";
    }
  | {
      inviteCode: string;
      kind: "generate";
      participantResponses: ParticipantResponses;
      plan: StudyPlan;
      progressState: InterviewProgressState;
      sessionId: string;
      study: NonNullable<Awaited<ReturnType<typeof findStudyById>>>;
      topicLabels: string[];
      transcript: Awaited<ReturnType<typeof listTranscriptForSession>>;
      userTurn: Awaited<ReturnType<typeof insertTranscriptTurn>>;
    };

type FinalizedPublicInterviewChatTurn = {
  annotationCreatedAt: string;
  assistantMetadata: InterviewMessageMetadata;
  assistantTurn: InterviewMessage;
};

const BASE_PARTICIPANT_FIELDS: ParticipantIntakeField[] = [
  {
    id: "preferredName",
    label: "Preferred name",
    placeholder: "e.g. Alex",
    required: true,
    type: "text",
  },
  {
    id: "ageRange",
    label: "Age range",
    options: [
      { label: "18-24", value: "18-24" },
      { label: "25-34", value: "25-34" },
      { label: "35-44", value: "35-44" },
      { label: "45+", value: "45+" },
    ],
    placeholder: "Select your range",
    required: true,
    type: "select",
  },
  {
    id: "country",
    label: "Country",
    options: [
      { label: "United States", value: "US" },
      { label: "Canada", value: "CA" },
      { label: "United Kingdom", value: "GB" },
      { label: "Australia", value: "AU" },
    ],
    placeholder: "Select your country",
    required: true,
    type: "select",
  },
];

function resolveParticipantFields(
  fields: ParticipantIntakeField[],
): ParticipantIntakeField[] {
  const legacyFieldIds = new Set(["studyExperience", "usedBudgetingAppRecently"]);
  return fields.filter((field) => !legacyFieldIds.has(field.id));
}

function nowIso() {
  return new Date().toISOString();
}

function toDisplayTimestamp(value: string) {
  return new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}

function toTitleCase(value: string) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function toRelativeLabel(value: string, prefix = "Updated") {
  const diff = Date.now() - new Date(value).getTime();
  const minutes = Math.max(1, Math.round(diff / 60000));

  if (minutes < 60) {
    return `${prefix} ${minutes} min${minutes === 1 ? "" : "s"} ago`;
  }

  const hours = Math.round(minutes / 60);

  if (hours < 24) {
    return `${prefix} ${hours} hour${hours === 1 ? "" : "s"} ago`;
  }

  const days = Math.round(hours / 24);
  return `${prefix} ${days} day${days === 1 ? "" : "s"} ago`;
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

function computeStudyStatus(
  study: Awaited<ReturnType<typeof findStudyById>> extends infer T ? NonNullable<T> : never,
  counts: Awaited<ReturnType<typeof countSessions>>,
): StudyStatus {
  if (study.status === "completed") {
    return "completed";
  }

  if (study.status === "archived") {
    return "archived";
  }

  if (counts.active > 0) {
    return "interviewing";
  }

  if (counts.completed > 0 && counts.completed >= study.interviewsTarget) {
    return "analyzing";
  }

  if (counts.total > 0) {
    return "interviewing";
  }

  return "planning";
}

function buildStudyObservation(options: {
  completedSessions: number;
  hasApprovedPlan: boolean;
  liveSessions: number;
  status: StudyStatus;
  totalSessions: number;
}) {
  const { completedSessions, hasApprovedPlan, liveSessions, status, totalSessions } = options;

  if (status === "completed") {
    return "This study has been ended and is now read-only. Existing transcripts, debriefs, and aggregate analysis remain available.";
  }

  if (status === "archived") {
    return "This study has been archived and removed from the default studies list. Existing transcripts, debriefs, and aggregate analysis remain available.";
  }

  if (status === "analyzing") {
    return "Completed interview debriefs are being synthesized into study-level analysis.";
  }

  if (status === "interviewing") {
    if (liveSessions > 0) {
      return "Participant sessions are in progress and their analysis will update after each completed interview.";
    }

    if (completedSessions > 0) {
      return "Completed sessions are accumulating and the study is ready for richer analysis.";
    }

    return "The study is ready for interviews and invite-driven participant sessions.";
  }

  if (hasApprovedPlan) {
    return "The interview plan is approved. Create an invite to begin the first participant session.";
  }

  if (totalSessions > 0) {
    return "The study has stored participant activity, but an approved plan is still required before new invites can be created.";
  }

  return "This study is ready for plan review. Generate or refine the interview plan before creating invites.";
}

function ensureStudyNotEnded(
  study: Awaited<ReturnType<typeof findStudyById>> extends infer T ? NonNullable<T> : never,
  actionLabel: string,
) {
  if (study.status === "completed" || study.status === "archived") {
    throw new ApiError(
      409,
      `This study has been ${study.status === "archived" ? "archived" : "ended"} and can no longer ${actionLabel}.`,
    );
  }
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

function buildAggregateThemesFromDebriefs(debriefs: SessionDebrief[]) {
  const counts = new Map<string, number>();

  for (const debrief of debriefs) {
    for (const theme of debrief.summary.topThemes) {
      counts.set(theme.label, (counts.get(theme.label) ?? 0) + theme.score);
    }
  }

  return [...counts.entries()]
    .sort((left, right) => right[1] - left[1])
    .map(([label]) => label);
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

function summarizeStudyAnalysis(
  sessions: StudySessionItem[],
): StudyDetail["analysis"] {
  const completedSessions = sessions.filter((session) => session.state === "completed").length;
  const readyDebriefs = sessions.filter(
    (session) => session.debriefStatus === "ready",
  ).length;
  const pendingDebriefs = sessions.filter(
    (session) => session.debriefStatus === "pending",
  ).length;
  const failedDebriefs = sessions.filter(
    (session) => session.debriefStatus === "failed",
  ).length;

  let status: StudyDetail["analysis"]["status"] = "not-started";

  if (readyDebriefs > 0 && pendingDebriefs === 0 && failedDebriefs === 0) {
    status = "ready";
  } else if (readyDebriefs > 0) {
    status = "partial";
  } else if (pendingDebriefs > 0) {
    status = "pending";
  } else if (failedDebriefs > 0) {
    status = "failed";
  } else if (completedSessions > 0) {
    status = "pending";
  }

  return {
    completedSessions,
    failedDebriefs,
    pendingDebriefs,
    readyDebriefs,
    status,
  };
}

async function refreshStudyStatus(
  db: DatabaseExecutor,
  studyId: string,
  updatedAt = nowIso(),
) {
  const study = await findStudyById(db, studyId);

  if (!study) {
    throw new ApiError(404, "Study not found.");
  }

  if (study.status === "completed") {
    return "completed";
  }

  if (study.status === "archived") {
    return "archived";
  }

  const counts = await countSessions(db, studyId);
  const nextStatus = computeStudyStatus(study, counts);

  if (nextStatus !== study.status) {
    await updateStudyStatus(db, studyId, nextStatus, updatedAt);
  }

  return nextStatus;
}

async function refreshStudyAggregate(db: DatabaseExecutor, studyId: string) {
  const study = await findStudyById(db, studyId);

  if (!study) {
    throw new ApiError(404, "Study not found.");
  }

  const [aggregate, counts, approvedPlan, draftPlan, debriefs] = await Promise.all([
    findStudyAggregate(db, studyId),
    countSessions(db, studyId),
    findCurrentApprovedPlan(db, studyId),
    findCurrentDraftPlan(db, studyId),
    listDebriefReportsForStudy(db, studyId),
  ]);
  const plan = approvedPlan ?? draftPlan ?? {
    topics: await findStudyTopics(db, studyId),
  };
  const topics = normalizeTopics(plan.topics);
  const debriefModels = debriefs.map((report) => report.content);
  const topicCoverage =
    debriefModels.length > 0
      ? buildStudyTopicCoverageFromDebriefs(topics, debriefModels)
      : buildTopicCoverageFallback(topics, counts);
  const coveredWeight = topicCoverage.reduce((sum, item) => {
    if (item.status === "covered") {
      return sum + 1;
    }

    if (item.status === "in-progress") {
      return sum + 0.5;
    }

    if (item.status === "weak-evidence") {
      return sum + 0.25;
    }

    return sum;
  }, 0);
  const coverage =
    topicCoverage.length === 0 ? 0 : Math.round((coveredWeight / topicCoverage.length) * 100);
  const fallbackThemes =
    debriefModels.length > 0
      ? buildAggregateThemesFromDebriefs(debriefModels)
      : topics;
  const themes = normalizeThemeLabels(aggregate?.themes?.length ? aggregate.themes : fallbackThemes).slice(0, 3);
  const hiddenThemesCount = Math.max(
    normalizeThemeLabels(
      aggregate?.themes?.length ? aggregate.themes : fallbackThemes,
    ).length - themes.length,
    0,
  );
  const contradictionCount = debriefs.reduce(
    (sum, report) => sum + report.contradictions.length,
    0,
  );
  const signalCount = debriefs.filter((report) => report.emotionSignal !== "low").length;
  const status = computeStudyStatus(study, counts);
  const observation =
    aggregate?.observation && aggregate.observation.length > 0
      ? aggregate.observation
      : buildStudyObservation({
          completedSessions: counts.completed,
          hasApprovedPlan: Boolean(approvedPlan),
          liveSessions: counts.live,
          status,
          totalSessions: counts.total,
        });
  const updatedAt = nowIso();

  await upsertStudyAggregate(db, {
    studyId,
    coverage,
    contradictionCount,
    completedSessionCount: debriefs.length,
    signalCount,
    themes,
    hiddenThemesCount,
    topicCoverage,
    observation,
    updatedAt,
  });
}

async function buildStudySummary(
  db: DatabaseExecutor,
  appBaseUrl: string,
  study: NonNullable<Awaited<ReturnType<typeof findStudyById>>>,
): Promise<StudySummary> {
  const [aggregate, approvedPlan, draftPlan, counts, latestInvite] = await Promise.all([
    findStudyAggregate(db, study.id),
    findCurrentApprovedPlan(db, study.id),
    findCurrentDraftPlan(db, study.id),
    countSessions(db, study.id),
    findLatestActiveInviteForStudy(db, study.id, nowIso()),
  ]);
  const topics =
    approvedPlan?.topics ??
    draftPlan?.topics ??
    (await findStudyTopics(db, study.id));
  const hasAggregateAnalysis = (aggregate?.completedSessionCount ?? 0) > 0;
  const awaitingAnalysis = counts.completed > 0 && !hasAggregateAnalysis;
  const statusLabel = study.status === "archived" ? "Archived" : toTitleCase(study.status);

  return {
    id: study.id,
    title: study.title,
    description: study.objective,
    status: study.status,
    statusLabel,
    canStartInterview:
      Boolean(approvedPlan) &&
      study.status !== "completed" &&
      study.status !== "archived",
    canArchiveStudy: study.status !== "archived" && counts.total > 0 && counts.active === 0,
    canEndStudy:
      study.status !== "completed" &&
      study.status !== "archived" &&
      counts.total > 0 &&
      counts.active === 0,
    latestInviteUrl: latestInvite
      && study.status !== "completed"
      && study.status !== "archived"
      ? `${appBaseUrl.replace(/\/$/, "")}/interviews/${latestInvite.inviteCode}`
      : undefined,
    interviewsCompleted: counts.completed,
    interviewsTarget: study.interviewsTarget,
    coverage: awaitingAnalysis ? 0 : aggregate?.coverage ?? 0,
    signalCount: awaitingAnalysis ? 0 : aggregate?.signalCount ?? 0,
    themeLabel:
      study.status === "planning"
        ? "Planned topics"
        : awaitingAnalysis
          ? "Awaiting analysis"
          : study.status === "completed" || study.status === "archived"
            ? "Top themes"
            : "Emerging themes",
    themes: awaitingAnalysis ? [] : aggregate?.themes ?? topics.slice(0, 3),
    hiddenThemesCount:
      awaitingAnalysis
        ? 0
        : aggregate?.hiddenThemesCount ?? Math.max(topics.length - 3, 0),
    observation:
      awaitingAnalysis
        ? PENDING_ANALYSIS_OBSERVATION
        : aggregate?.observation ??
          "This study is ready for plan review. Generate or refine the interview plan before creating invites.",
    updatedLabel: toRelativeLabel(study.updatedAt),
    actionLabel:
      study.status === "planning"
        ? "Review Plan"
        : study.status === "completed" || study.status === "archived"
          ? "View Study"
          : "Continue Study",
    accent: study.status,
  };
}

function buildTopicCoverage(options: {
  aggregate: Awaited<ReturnType<typeof findStudyAggregate>>;
  counts: Awaited<ReturnType<typeof countSessions>>;
  topics: string[];
}): StudyDetail["topicCoverage"] {
  const { aggregate, counts, topics } = options;
  if (
    aggregate?.topicCoverage?.length &&
    ((aggregate.completedSessionCount ?? 0) > 0 || counts.completed === 0)
  ) {
    return aggregate.topicCoverage;
  }

  return buildTopicCoverageFallback(topics, counts);
}

function buildSessionDebriefState(options: {
  latestJob: Awaited<ReturnType<typeof findLatestAnalysisJob>> | null;
  report: Awaited<ReturnType<typeof findDebriefReportBySessionId>> | null;
  sessionId: string;
  studyId: string;
}): SessionDebriefResponse | null {
  const { latestJob, report, sessionId, studyId } = options;

  if (report) {
    return debriefResponseFromRow(report);
  }

  if (!latestJob) {
    return null;
  }

  if (latestJob.status === "failed") {
    return {
      error: latestJob.error ?? "Debrief generation failed.",
      sessionId,
      status: "failed",
      studyId,
    };
  }

  return {
    sessionId,
    status: "pending",
    studyId,
  };
}

async function getSessionDebriefResponse(
  db: DatabaseExecutor,
  studyId: string,
  sessionId: string,
): Promise<SessionDebriefResponse | null> {
  const [report, latestJob] = await Promise.all([
    findDebriefReportBySessionId(db, sessionId),
    findLatestAnalysisJob(db, {
      kind: "session-debrief",
      sessionId,
      studyId,
    }),
  ]);

  return buildSessionDebriefState({
    latestJob,
    report,
    sessionId,
    studyId,
  });
}

async function buildSessionItems(
  db: DatabaseExecutor,
  studyId: string,
  sessions: Awaited<ReturnType<typeof listSessionsForStudy>>,
  topicLabels: string[],
  debriefReports: Awaited<ReturnType<typeof listDebriefReportsForStudy>>,
): Promise<StudySessionItem[]> {
  const sessionIds = sessions.map((session) => session.id);
  const latestJobs = await listLatestAnalysisJobsForSessions(db, {
    kind: "session-debrief",
    sessionIds,
    studyId,
  });

  const debriefBySessionId = new Map(
    debriefReports.map((report) => [report.sessionId, report]),
  );
  const latestJobBySessionId = new Map<string, (typeof latestJobs)[number]>();

  for (const job of latestJobs) {
    if (job.sessionId && !latestJobBySessionId.has(job.sessionId)) {
      latestJobBySessionId.set(job.sessionId, job);
    }
  }

  const fallbackSessionIds = sessions
    .filter((session) => !debriefBySessionId.has(session.id))
    .map((session) => session.id);
  const [latestAnnotations, transcriptRows] = await Promise.all([
    listLatestSessionAnnotationsForSessions(db, fallbackSessionIds),
    listTranscriptForSessions(db, fallbackSessionIds),
  ]);
  const latestAnnotationBySessionId = new Map<string, (typeof latestAnnotations)[number]>();
  const transcriptBySessionId = new Map<string, (typeof transcriptRows)>();

  for (const annotation of latestAnnotations) {
    if (!latestAnnotationBySessionId.has(annotation.sessionId)) {
      latestAnnotationBySessionId.set(annotation.sessionId, annotation);
    }
  }

  for (const row of transcriptRows) {
    const transcript = transcriptBySessionId.get(row.sessionId);

    if (transcript) {
      transcript.push(row);
    } else {
      transcriptBySessionId.set(row.sessionId, [row]);
    }
  }

  return sessions.map((session) => {
    const isComplete = session.sessionStatus === "complete";
    const participantLabel = `Participant ${String(session.participantNumber).padStart(2, "0")}`;
    const debriefReport = debriefBySessionId.get(session.id) ?? null;
    const debriefState = buildSessionDebriefState({
      latestJob: latestJobBySessionId.get(session.id) ?? null,
      report: debriefReport,
      sessionId: session.id,
      studyId,
    });
    const latestAnnotation = latestAnnotationBySessionId.get(session.id) ?? null;
    const transcript = transcriptBySessionId.get(session.id) ?? [];
    const fallbackProgressState =
      debriefState?.status === "ready"
        ? null
        : latestAnnotation
          ? normalizeProgressState(topicLabels, latestAnnotation.progressState)
          : buildFallbackAnnotationState(topicLabels, transcript);
    const coveredTopics =
      debriefState?.status === "ready"
        ? debriefState.debrief.coverage.topics.filter((item) => item.status === "covered").length
        : fallbackProgressState?.coveredTopicLabels.length ?? 0;
    const knownTotalTopics =
      debriefState?.status === "ready"
        ? debriefState.debrief.coverage.topics.length
        : topicLabels.length;
    const progress =
      knownTotalTopics === 0 ? 0 : Math.round((coveredTopics / knownTotalTopics) * 100);
    const emotionalSignal =
      debriefState?.status === "ready"
        ? debriefReport?.emotionSignal ?? "low"
        : latestAnnotation?.emotionSignal ?? "low";
    const contradictionsCount =
      debriefState?.status === "ready"
        ? debriefReport?.contradictions.length ?? 0
        : latestAnnotation?.contradictions.length ?? 0;
    const debriefStatus = isComplete
      ? debriefState?.status ?? "pending"
      : "unavailable";
    const actionLabel =
      debriefStatus === "ready"
        ? "View Debrief"
        : debriefStatus === "failed"
          ? "Debrief Failed"
          : debriefStatus === "pending"
            ? "Debrief Pending"
            : "Participant In Progress";

    return {
      id: session.id,
      participantLabel,
      participantInitials: `P${session.participantNumber}`,
      state: isComplete ? "completed" : "in-progress",
      stateLabel: isComplete ? "Completed" : "In Progress",
      timingLabel:
        isComplete && session.completedAt
          ? toRelativeLabel(session.completedAt, "").replace(/^ /, "")
          : toRelativeLabel(session.updatedAt, "").replace(/^ /, ""),
      emotionalSignal,
      topicsCoveredLabel: `${coveredTopics} / ${knownTotalTopics}`,
      topicsCoveredProgress: progress,
      contradictionsCount,
      actionLabel,
      actionTone: "outline",
      debriefError: debriefState?.status === "failed" ? debriefState.error : undefined,
      debriefStatus,
    };
  });
}

function buildRecentActivity(
  sessions: Awaited<ReturnType<typeof listSessionsForStudy>>,
  debriefs: Awaited<ReturnType<typeof listDebriefReportsForStudy>>,
): StudyDetail["recentActivity"] {
  const debriefBySessionId = new Map(
    debriefs.map((debrief) => [debrief.sessionId, debrief]),
  );

  return sessions
    .flatMap<StudyDetail["recentActivity"][number]>((session) => {
      const participantLabel = `Participant ${String(session.participantNumber).padStart(2, "0")}`;
      const debrief = debriefBySessionId.get(session.id);

      if (session.sessionStatus === "complete" && session.completedAt) {
        const items: StudyDetail["recentActivity"] = [
          {
            id: `complete-${session.id}`,
            type: "session-complete",
            title: `${participantLabel} completed the interview`,
            timestamp: toRelativeLabel(session.completedAt, "").replace(/^ /, ""),
          },
        ];

        if (debrief?.emotionSignal && debrief.emotionSignal !== "low") {
          items.push({
            id: `signal-${session.id}`,
            type: "signal",
            title: `${participantLabel} surfaced ${debrief.emotionSignal} emotional signals`,
            timestamp: toRelativeLabel(debrief.updatedAt, "").replace(/^ /, ""),
          });
        }

        if ((debrief?.contradictions.length ?? 0) > 0) {
          items.push({
            detail: debrief?.contradictions[0],
            id: `contradiction-${session.id}`,
            type: "contradiction",
            title: `${participantLabel} introduced ${debrief?.contradictions.length} contradiction${debrief?.contradictions.length === 1 ? "" : "s"}`,
            timestamp: toRelativeLabel(
              debrief?.updatedAt ?? session.completedAt ?? session.updatedAt,
              "",
            ).replace(/^ /, ""),
          });
        }

        return items;
      }

      if (session.sessionStatus === "room") {
        return [
          {
            id: `room-${session.id}`,
            type: "session-start",
            title: `${participantLabel} interview started`,
            timestamp: toRelativeLabel(session.updatedAt, "").replace(/^ /, ""),
          },
        ];
      }

      if (
        session.sessionStatus === "details" ||
        session.sessionStatus === "preparing"
      ) {
        return [
          {
            id: `details-${session.id}`,
            type: "session-start",
            title: `${participantLabel} accepted the invite`,
            timestamp: toRelativeLabel(session.updatedAt, "").replace(/^ /, ""),
          },
        ];
      }

      return [];
    })
    .slice(0, 5);
}

async function getInviteRoutePayload(
  db: DatabaseExecutor,
  invite: NonNullable<Awaited<ReturnType<typeof findInviteWithSession>>>["invite"],
  sessionStatus: InterviewSessionStatus,
): Promise<InterviewInvitePayload> {
  const study = await findStudyById(db, invite.studyId);

  if (!study) {
    throw new ApiError(404, "Study not found.");
  }

  const approvedPlan = await findCurrentApprovedPlan(db, study.id);

  if (!approvedPlan) {
    throw new ApiError(409, "Approved plan not found for invite.");
  }

  return {
    consentCopy: DEFAULT_CONSENT_COPY,
    estimatedDuration:
      approvedPlan.estimatedDurationLabel ??
      formatEstimatedInterviewDuration(
        approvedPlan.estimatedDurationMinutes ?? 15,
      ),
    formatLabel: DEFAULT_FORMAT_LABEL,
    introCopy: DEFAULT_INTRO_COPY,
    inviteCode: invite.inviteCode,
    participantFields: resolveParticipantFields(await findParticipantFields(db, study.id)),
    sessionStatus,
    studyTitle: study.title,
    topicLabels: approvedPlan.topics,
  };
}

async function getTranscript(
  db: DatabaseExecutor,
  sessionId: string,
): Promise<InterviewMessage[]> {
  const rows = await listTranscriptForSession(db, sessionId);

  return rows.map(mapTranscriptTurnToMessage);
}

function normalizeProgressState(
  topicLabels: string[],
  progressState: InterviewProgressState,
): InterviewProgressState {
  const coveredTopicLabels = topicLabels.filter((label) =>
    progressState.coveredTopicLabels.includes(label),
  );
  const activeTopicLabel =
    typeof progressState.activeTopicLabel === "string" &&
    topicLabels.includes(progressState.activeTopicLabel) &&
    !coveredTopicLabels.includes(progressState.activeTopicLabel)
      ? progressState.activeTopicLabel
      : null;
  const remainingTopicLabels = topicLabels.filter(
    (label) => !coveredTopicLabels.includes(label) && label !== activeTopicLabel,
  );

  return {
    activeTopicLabel,
    completionRatio: Math.max(0, Math.min(progressState.completionRatio, 1)),
    coveredTopicLabels,
    remainingTopicLabels,
  };
}

function buildFallbackAnnotationState(
  topicLabels: string[],
  transcript: Array<{
    role: "assistant" | "user";
    text: string;
  }>,
) {
  return buildFallbackInterviewProgressState(topicLabels, transcript);
}

function buildAssistantMetadata(
  progressState: InterviewProgressState,
  assistantTurn: InterviewMessage,
): InterviewMessageMetadata {
  return {
    assistantTurnId: assistantTurn.id,
    progressState,
    timestampLabel: assistantTurn.timestampLabel,
  };
}

function mapTranscriptTurnToMessage(
  row: Awaited<ReturnType<typeof listTranscriptForSession>>[number],
): InterviewMessage {
  return {
    id: row.id,
    role: row.role,
    text: row.text,
    timestampLabel: row.timestampLabel,
  };
}

export async function createStudy(
  db: AppDatabase,
  appBaseUrl: string,
  input: CreateStudyInput,
): Promise<CreateStudyResponse> {
  const topics = normalizeTopics(input.topics);

  if (topics.length === 0) {
    throw new ApiError(400, "At least one study topic is required.");
  }

  const studyId = await createUniqueStudyId(db, input.title);
  const createdAt = nowIso();

  await db.transaction(async (tx) => {
    await insertStudy(tx, {
      id: studyId,
      slug: studyId,
      title: input.title.trim(),
      objective: input.objective.trim(),
      audience: input.audience.trim(),
      context: input.context.trim(),
      durationMinutes: 0,
      status: "planning",
      interviewsTarget: input.targetParticipants,
      createdAt,
      updatedAt: createdAt,
    });

    await insertStudyTopics(
      tx,
      topics.map((topic, index) => ({
        id: createPrefixedId("topic"),
        studyId,
        label: topic,
        sortOrder: index,
      })),
    );

    await insertParticipantFields(
      tx,
      BASE_PARTICIPANT_FIELDS.map((field, index) => ({
        id: createPrefixedId("field"),
        studyId,
        fieldKey: field.id,
        label: field.label,
        type: field.type,
        options: field.options ?? null,
        required: field.required ?? false,
        placeholder: field.placeholder ?? null,
        helperText: field.helperText ?? null,
        sortOrder: index,
      })),
    );

    await refreshStudyAggregate(tx, studyId);
  });

  const study = await findStudyById(db, studyId);

  if (!study) {
    throw new ApiError(500, "Failed to create study.");
  }

  return {
    studyId,
    study: await buildStudySummary(db, appBaseUrl, study),
  };
}

export async function listStudies(
  db: AppDatabase,
  appBaseUrl: string,
  query: ListStudiesQuery = {},
): Promise<StudySummary[]> {
  const rows = await listStudiesOrdered(db, query);
  return Promise.all(rows.map((row) => buildStudySummary(db, appBaseUrl, row)));
}

export async function getStudyDetail(
  db: AppDatabase,
  studyId: string,
): Promise<StudyDetail> {
  const study = await findStudyById(db, studyId);

  if (!study) {
    throw new ApiError(404, "Study not found.");
  }

  const [aggregate, approvedPlan, draftPlan, sessions, counts, debriefs] =
    await Promise.all([
      findStudyAggregate(db, studyId),
      findCurrentApprovedPlan(db, studyId),
      findCurrentDraftPlan(db, studyId),
      listSessionsForStudy(db, studyId),
      countSessions(db, studyId),
      listDebriefReportsForStudy(db, studyId),
    ]);
  const topics =
    approvedPlan?.topics ??
    draftPlan?.topics ??
    (await findStudyTopics(db, studyId));
  const [topicCoverage, sessionsForDetail] = await Promise.all([
    buildTopicCoverage({
      aggregate,
      counts,
      topics,
    }),
    buildSessionItems(db, studyId, sessions, topics, debriefs),
  ]);
  const recentActivity = buildRecentActivity(sessions, debriefs);
  const analysis = summarizeStudyAnalysis(sessionsForDetail);
  const displayPlan = approvedPlan ?? draftPlan;
  const hasAggregateAnalysis = analysis.readyDebriefs > 0;
  const interviewProgress =
    study.interviewsTarget === 0 ? 0 : Math.round((counts.completed / study.interviewsTarget) * 100);
  const topicCoverageMetric =
    analysis.status === "pending"
      ? {
          id: "topic-coverage",
          label: "Topic Coverage",
          subtitle: `Waiting for debrief analysis on ${analysis.pendingDebriefs} completed interview${analysis.pendingDebriefs === 1 ? "" : "s"}`,
          tone: "success" as const,
          value: "N/A",
        }
      : analysis.status === "failed" && analysis.readyDebriefs === 0
        ? {
            id: "topic-coverage",
            label: "Topic Coverage",
            subtitle: "Unavailable until debrief analysis is retried",
            tone: "success" as const,
            value: "N/A",
          }
        : {
            id: "topic-coverage",
            label: "Topic Coverage",
            value: `${topicCoverage.filter((item) => item.status === "covered").length} / ${topicCoverage.length}`,
            subtitle:
              analysis.status === "partial"
                ? `Based on ${analysis.readyDebriefs} of ${analysis.completedSessions} analyzed interviews`
                : "Research topics explored",
            progress: topicCoverage.length === 0 ? 0 : aggregate?.coverage ?? 0,
            progressLabel: `${aggregate?.coverage ?? 0}%`,
            tone: "success" as const,
          };
  const strongSignalsMetric =
    analysis.status === "pending"
      ? {
          id: "strong-signals",
          label: "Strong Signals",
          subtitle: "Will appear after debrief analysis finishes",
          tone: "warning" as const,
          value: "N/A",
        }
      : analysis.status === "failed" && analysis.readyDebriefs === 0
        ? {
            id: "strong-signals",
            label: "Strong Signals",
            subtitle: "Unavailable until debrief analysis is retried",
            tone: "warning" as const,
            value: "N/A",
          }
        : {
            id: "strong-signals",
            label: "Strong Signals",
            value: String(aggregate?.signalCount ?? 0),
            subtitle:
              analysis.status === "partial"
                ? `From ${analysis.readyDebriefs} analyzed interview${analysis.readyDebriefs === 1 ? "" : "s"}`
                : "Emotional moments detected",
            tone: "warning" as const,
          };
  const contradictionsMetric =
    analysis.status === "pending"
      ? {
          id: "contradictions",
          label: "Contradictions",
          subtitle: "Will appear after debrief analysis finishes",
          tone: "violet" as const,
          value: "N/A",
        }
      : analysis.status === "failed" && analysis.readyDebriefs === 0
        ? {
            id: "contradictions",
            label: "Contradictions",
            subtitle: "Unavailable until debrief analysis is retried",
            tone: "violet" as const,
            value: "N/A",
          }
        : {
            id: "contradictions",
            label: "Contradictions",
            value: String(aggregate?.contradictionCount ?? 0),
            subtitle:
              analysis.status === "partial"
                ? `From ${analysis.readyDebriefs} analyzed interview${analysis.readyDebriefs === 1 ? "" : "s"}`
                : "Contradictions surfaced",
            tone: "violet" as const,
          };

  return {
    studyId: study.id,
    title: study.title,
    description: study.objective,
    status: study.status,
    statusLabel: study.status === "archived" ? "Archived" : toTitleCase(study.status),
    hasApprovedPlan: Boolean(approvedPlan),
    canStartInterview:
      Boolean(approvedPlan) &&
      study.status !== "completed" &&
      study.status !== "archived",
    canApprovePlan: study.status !== "completed" && study.status !== "archived",
    canEditPlan: study.status !== "completed" && study.status !== "archived",
    canEndStudy:
      study.status !== "completed" &&
      study.status !== "archived" &&
      counts.total > 0 &&
      counts.active === 0,
    canRegeneratePlan: study.status !== "completed" && study.status !== "archived",
    metadata: {
      createdLabel: toRelativeLabel(study.createdAt, "Created"),
      interviewDurationLabel:
        displayPlan?.estimatedDurationLabel ?? "Estimate after plan generation",
      audienceLabel: study.audience,
      interviewCountLabel: `${study.interviewsTarget} target participants`,
    },
    analysis,
    metrics: [
      {
        id: "interview-progress",
        label: "Interview Progress",
        value: `${counts.completed} / ${study.interviewsTarget}`,
        subtitle: "Participants completed",
        progress: interviewProgress,
        progressLabel: `${interviewProgress}%`,
        tone: "primary",
      },
      topicCoverageMetric,
      strongSignalsMetric,
      contradictionsMetric,
    ],
    insightThemes:
      analysis.status === "pending" || analysis.status === "failed"
        ? []
        : aggregate?.themes ?? topics.slice(0, 3),
    aiObservation:
      analysis.status === "pending"
        ? PENDING_ANALYSIS_OBSERVATION
        : analysis.status === "failed" && !hasAggregateAnalysis
          ? FAILED_ANALYSIS_OBSERVATION
          : aggregate?.observation ??
            "This study is ready for plan review. Generate or refine the interview plan before creating invites.",
    topicCoverage,
    sessions: sessionsForDetail,
    recentActivity,
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
    throw new ApiError(404, "Study plan not found.");
  }

  return plan;
}

export async function generateStudyPlan(
  db: AppDatabase,
  studyId: string,
  researchAiService: ResearchAiService,
): Promise<StudyPlan> {
  const study = await findStudyById(db, studyId);

  if (!study) {
    throw new ApiError(404, "Study not found.");
  }

  ensureStudyNotEnded(study, "generate a new plan");

  const topics = await findStudyTopics(db, studyId);
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
        "We could not generate a reliable interview plan right now.",
      );
    }

    throw error;
  }

  if (!validatedPlanOutput) {
    throw new ApiError(502, "We could not generate a reliable interview plan right now.");
  }

  const plan = buildStudyPlan(study, {
    ...validatedPlanOutput,
    objective: validatedPlanOutput.objective.trim() || study.objective,
  });
  const versionNumber = (await getHighestPlanVersion(db, studyId, "draft")) + 1;
  const updatedAt = nowIso();

  await db.transaction(async (tx) => {
    await saveDraftPlan(tx, {
      createdAt: updatedAt,
      draftPlanId: createPrefixedId("plan"),
      plan,
      studyId,
      versionNumber,
    });

    await touchStudy(tx, studyId, updatedAt);
    await refreshStudyAggregate(tx, studyId);
  });

  return plan;
}

export async function updateStudyPlan(
  db: AppDatabase,
  studyId: string,
  input: UpdateStudyPlanInput,
): Promise<StudyPlan> {
  const study = await findStudyById(db, studyId);

  if (!study) {
    throw new ApiError(404, "Study not found.");
  }

  ensureStudyNotEnded(study, "be edited");

  const draftRow = await findCurrentPlanVersion(db, studyId, "draft");

  if (!draftRow) {
    throw new ApiError(409, "A draft plan must exist before it can be edited.");
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
    throw new ApiError(404, "Study not found.");
  }

  ensureStudyNotEnded(study, "approve a plan");

  const draftRow = await findCurrentPlanVersion(db, studyId, "draft");

  if (!draftRow) {
    throw new ApiError(409, "A draft plan is required before approval.");
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

export async function createStudyInvite(
  db: AppDatabase,
  appBaseUrl: string,
  studyId: string,
): Promise<CreateInviteResponse> {
  const study = await findStudyById(db, studyId);

  if (!study) {
    throw new ApiError(404, "Study not found.");
  }

  ensureStudyNotEnded(study, "create new invites");

  const approvedPlan = await findCurrentApprovedPlan(db, studyId);

  if (!approvedPlan) {
    throw new ApiError(409, "An approved plan is required before creating an invite.");
  }

  ensureStudyPlanIsValid(approvedPlan, "be used to create an invite");

  const createdAt = nowIso();
  const sessionId = createPrefixedId("session");
  const inviteId = createPrefixedId("invite");
  const profileId = createPrefixedId("profile");
  const inviteCode = await createInviteCode(db);
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

  await db.transaction(async (tx) => {
    const participantNumber = (await countSessions(tx, studyId)).total + 1;

    await createInterviewSession(tx, {
      id: sessionId,
      studyId,
      sessionStatus: "welcome",
      participantNumber,
      createdAt,
      updatedAt: createdAt,
      completedAt: null,
    });

    await createInterviewInvite(tx, {
      id: inviteId,
      studyId,
      sessionId,
      inviteCode,
      createdAt,
      expiresAt,
      revokedAt: null,
    });

    await createParticipantProfile(tx, {
      id: profileId,
      sessionId,
      responses: {},
      consentAccepted: false,
      consentedAt: null,
    });

    await updateStudyStatus(tx, studyId, "interviewing", createdAt);
    await refreshStudyAggregate(tx, studyId);
  });

  return {
    inviteCode,
    inviteUrl: `${appBaseUrl.replace(/\/$/, "")}/interviews/${inviteCode}`,
    expiresAt,
    sessionId,
  };
}

async function enqueueSessionDebriefJob(
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
}

async function enqueueStudyAggregateJob(
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
}

export async function getStudySessionDebrief(
  db: AppDatabase,
  studyId: string,
  sessionId: string,
): Promise<SessionDebriefResponse> {
  const [study, session] = await Promise.all([
    findStudyById(db, studyId),
    findSessionById(db, sessionId),
  ]);

  if (!study || !session || session.studyId !== studyId) {
    throw new ApiError(404, "Interview session not found.");
  }

  if (session.sessionStatus !== "complete") {
    return {
      sessionId,
      status: "pending",
      studyId,
    };
  }

  const debrief = await getSessionDebriefResponse(db, studyId, sessionId);

  return (
    debrief ?? {
      sessionId,
      status: "pending",
      studyId,
    }
  );
}

export async function endStudy(
  db: AppDatabase,
  studyId: string,
): Promise<EndStudyResponse> {
  const study = await findStudyById(db, studyId);

  if (!study) {
    throw new ApiError(404, "Study not found.");
  }

  if (study.status === "completed") {
    return {
      ok: true,
      status: "completed",
      studyId,
    };
  }

  const counts = await countSessions(db, studyId);

  if (counts.active > 0) {
    throw new ApiError(409, "All participant sessions must be finished before ending the study.");
  }

  const updatedAt = nowIso();

  await db.transaction(async (tx) => {
    await updateStudyStatus(tx, studyId, "completed", updatedAt);
    await cancelQueuedAnalysisJobsForStudy(tx, studyId, updatedAt);
    await refreshStudyAggregate(tx, studyId);
    await touchStudy(tx, studyId, updatedAt);
  });

  return {
    ok: true,
    status: "completed",
    studyId,
  };
}

export async function archiveStudy(
  db: AppDatabase,
  studyId: string,
): Promise<ArchiveStudyResponse> {
  const study = await findStudyById(db, studyId);

  if (!study) {
    throw new ApiError(404, "Study not found.");
  }

  if (study.status === "archived") {
    return {
      ok: true,
      status: "archived",
      studyId,
    };
  }

  const counts = await countSessions(db, studyId);

  if (counts.active > 0) {
    throw new ApiError(409, "All participant sessions must be finished before archiving the study.");
  }

  const updatedAt = nowIso();

  await db.transaction(async (tx) => {
    await updateStudyStatus(tx, studyId, "archived", updatedAt);
    await cancelQueuedAnalysisJobsForStudy(tx, studyId, updatedAt);
    await refreshStudyAggregate(tx, studyId);
    await touchStudy(tx, studyId, updatedAt);
  });

  return {
    ok: true,
    status: "archived",
    studyId,
  };
}

function formatAnalysisError(error: unknown) {
  if (error instanceof Error && error.message) {
    return error.message;
  }

  return "Analysis job failed.";
}

function computeAggregateCoverageValue(topicCoverage: StudyDetail["topicCoverage"]) {
  if (topicCoverage.length === 0) {
    return 0;
  }

  const weighted = topicCoverage.reduce((sum, item) => {
    if (item.status === "covered") {
      return sum + 1;
    }

    if (item.status === "in-progress") {
      return sum + 0.5;
    }

    if (item.status === "weak-evidence") {
      return sum + 0.25;
    }

    return sum;
  }, 0);

  return Math.round((weighted / topicCoverage.length) * 100);
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

export async function getPublicInterviewRouteState(
  db: AppDatabase,
  inviteCode: string,
): Promise<PublicInterviewRouteState> {
  const inviteBundle = await findInviteWithSession(db, inviteCode);

  if (!inviteBundle) {
    return {
      inviteCode: inviteCode.toUpperCase(),
      kind: "invalid",
    };
  }

  const { invite, session } = inviteBundle;
  const isExpired =
    invite.revokedAt !== null || new Date(invite.expiresAt).getTime() <= Date.now();

  if (isExpired) {
    return {
      invite: await getInviteRoutePayload(db, invite, "expired"),
      kind: "expired",
    };
  }

  const [latestAnnotation, profile, transcript, invitePayload] = await Promise.all([
    findLatestSessionAnnotation(db, session.id),
    findParticipantProfileBySessionId(db, session.id),
    getTranscript(db, session.id),
    getInviteRoutePayload(db, invite, session.sessionStatus),
  ]);
  const participantResponses = profile?.responses ?? {};
  const sessionState: InterviewSessionState = {
    inviteCode: invite.inviteCode,
    participantResponses,
    progressState: latestAnnotation
      ? normalizeProgressState(invitePayload.topicLabels, latestAnnotation.progressState)
      : buildFallbackAnnotationState(invitePayload.topicLabels, transcript),
    sessionStatus: session.sessionStatus,
    transcript,
  };

  return {
    invite: invitePayload,
    kind: "ready",
    session: sessionState,
  };
}

export async function preparePublicInterviewChatTurn(
  db: AppDatabase,
  inviteCode: string,
  input: {
    clientMessageId: string;
    userText: string;
  },
): Promise<PreparedPublicInterviewChatTurn> {
  const inviteBundle = await findInviteWithSession(db, inviteCode);

  if (!inviteBundle) {
    throw new ApiError(404, "Interview invite is not available.");
  }

  const { invite, session } = inviteBundle;

  if (invite.revokedAt !== null || new Date(invite.expiresAt).getTime() <= Date.now()) {
    throw new ApiError(410, "Interview invite has expired.");
  }

  return db.transaction(async (tx) => {
    await lockInterviewSession(tx, session.id);

    const lockedSession = await findSessionById(tx, session.id);
    const profile = await findParticipantProfileBySessionId(tx, session.id);
    const study = await findStudyById(tx, invite.studyId);
    const approvedPlan = await findCurrentApprovedPlan(tx, invite.studyId);

    if (!lockedSession || !profile || !study) {
      throw new ApiError(500, "Interview session state is missing.");
    }

    if (lockedSession.sessionStatus !== "room") {
      throw new ApiError(409, "Interview session is not active.");
    }

    if (!approvedPlan) {
      throw new ApiError(409, "Approved plan not found for this interview.");
    }

    const existingUserTurn = await findTranscriptTurnByClientMessageId(
      tx,
      session.id,
      input.clientMessageId,
    );

    let userTurn = existingUserTurn;

    if (!userTurn) {
      const createdAt = nowIso();
      const nextSortOrder = await getNextTranscriptSortOrder(tx, session.id);
      userTurn = await insertTranscriptTurn(tx, {
        clientMessageId: input.clientMessageId,
        createdAt,
        finishReason: null,
        id: createPrefixedId("turn"),
        model: null,
        providerResponseId: null,
        role: "user",
        sessionId: session.id,
        sortOrder: nextSortOrder,
        text: input.userText,
        timestampLabel: toDisplayTimestamp(createdAt),
      });
    }

    const transcript = await listTranscriptForSession(tx, session.id);
    const latestAnnotation = await findLatestSessionAnnotation(tx, session.id);
    const nextTurn = await findNextTranscriptTurn(tx, session.id, userTurn.sortOrder);
    const baseProgressState = latestAnnotation
      ? normalizeProgressState(approvedPlan.topics, latestAnnotation.progressState)
      : buildFallbackAnnotationState(approvedPlan.topics, transcript);

    if (nextTurn?.role === "assistant") {
      const nextAnnotation = await findAnnotationByAssistantTurnId(tx, nextTurn.id);
      const assistantTurn = mapTranscriptTurnToMessage(nextTurn);
      const progressState = nextAnnotation
        ? normalizeProgressState(approvedPlan.topics, nextAnnotation.progressState)
        : buildFallbackAnnotationState(
            approvedPlan.topics,
            transcript.map(mapTranscriptTurnToMessage),
          );

      return {
        assistantMetadata: buildAssistantMetadata(progressState, assistantTurn),
        assistantTurn,
        kind: "replay",
      };
    }

    return {
      inviteCode: invite.inviteCode,
      kind: "generate",
      participantResponses: profile.responses ?? {},
      plan: approvedPlan,
      progressState: baseProgressState,
      sessionId: session.id,
      study,
      topicLabels: approvedPlan.topics,
      transcript,
      userTurn,
    };
  });
}

export async function finalizePublicInterviewChatTurn(
  db: AppDatabase,
  prepared: Extract<PreparedPublicInterviewChatTurn, { kind: "generate" }>,
  input: {
    annotation: {
      contradictions: string[];
      emotionSignal: "low" | "medium" | "high";
      evidenceQuotes: string[];
      progressState: InterviewProgressState;
    };
    assistantTurnId: string;
    finishReason: string;
    model: string;
    providerResponseId?: string;
    text: string;
  },
): Promise<FinalizedPublicInterviewChatTurn> {
  const createdAt = nowIso();
  const progressState = normalizeProgressState(
    prepared.topicLabels,
    input.annotation.progressState,
  );
  const assistantTurn: InterviewMessage = {
    id: input.assistantTurnId,
    role: "assistant",
    text: input.text,
    timestampLabel: toDisplayTimestamp(createdAt),
  };

  await db.transaction(async (tx) => {
    await lockInterviewSession(tx, prepared.sessionId);

    await insertTranscriptTurn(tx, {
      clientMessageId: null,
      createdAt,
      finishReason: input.finishReason,
      id: input.assistantTurnId,
      model: input.model,
      providerResponseId: input.providerResponseId ?? null,
      role: "assistant",
      sessionId: prepared.sessionId,
      sortOrder: await getNextTranscriptSortOrder(tx, prepared.sessionId),
      text: input.text,
      timestampLabel: assistantTurn.timestampLabel,
    });

    await insertSessionAnnotation(tx, {
      assistantTurnId: input.assistantTurnId,
      contradictions: input.annotation.contradictions,
      createdAt,
      emotionSignal: input.annotation.emotionSignal,
      evidenceQuotes: input.annotation.evidenceQuotes,
      id: createPrefixedId("annotation"),
      progressState,
      sessionId: prepared.sessionId,
      userTurnId: prepared.userTurn.id,
    });
  });

  return {
    annotationCreatedAt: createdAt,
    assistantMetadata: buildAssistantMetadata(progressState, assistantTurn),
    assistantTurn,
  };
}

export async function performPublicInterviewAction(
  db: AppDatabase,
  inviteCode: string,
  input: PublicInterviewActionInput,
): Promise<PublicInterviewActionResponse> {
  const inviteBundle = await findInviteWithSession(db, inviteCode);

  if (!inviteBundle) {
    throw new ApiError(404, "Interview invite is not available.");
  }

  const { invite, session } = inviteBundle;

  if (invite.revokedAt !== null || new Date(invite.expiresAt).getTime() <= Date.now()) {
    throw new ApiError(410, "Interview invite has expired.");
  }

  await db.transaction(async (tx) => {
    await lockInterviewSession(tx, session.id);

    const lockedSession = await findSessionById(tx, session.id);
    const lockedProfile = await findParticipantProfileBySessionId(tx, session.id);

    if (!lockedSession || !lockedProfile) {
      throw new ApiError(500, "Interview session state is missing.");
    }

    const updatedAt = nowIso();

    switch (input.action) {
      case "advance-to-details":
        if (lockedSession.sessionStatus === "welcome") {
          await updateInterviewSessionState(tx, session.id, {
            sessionStatus: "details",
            updatedAt,
          });
        }
        break;
      case "submit-details": {
        if (!input.consentAccepted) {
          throw new ApiError(400, "Consent is required before continuing.");
        }

        await updateParticipantProfileBySessionId(tx, session.id, {
          responses: input.participantResponses ?? {},
          consentAccepted: true,
          consentedAt: lockedProfile.consentedAt ?? updatedAt,
        });

        if (
          lockedSession.sessionStatus === "welcome" ||
          lockedSession.sessionStatus === "details" ||
          lockedSession.sessionStatus === "preparing"
        ) {
          await updateInterviewSessionState(tx, session.id, {
            sessionStatus: "preparing",
            updatedAt,
          });
        }
        break;
      }
      case "start-room": {
        const approvedPlan = await findCurrentApprovedPlan(tx, invite.studyId);

        if (!approvedPlan) {
          throw new ApiError(409, "Approved plan not found for this interview.");
        }

        if (
          lockedSession.sessionStatus === "welcome" ||
          lockedSession.sessionStatus === "details" ||
          lockedSession.sessionStatus === "preparing"
        ) {
          await updateInterviewSessionState(tx, session.id, {
            sessionStatus: "room",
            updatedAt,
          });
        }

        if (lockedSession.sessionStatus !== "complete") {
          const existingTurn = await hasTranscriptTurns(tx, session.id);

          if (!existingTurn) {
            await insertTranscriptTurn(tx, {
              id: createPrefixedId("turn"),
              sessionId: session.id,
              role: "assistant",
              text: approvedPlan.openingQuestion,
              timestampLabel: toDisplayTimestamp(updatedAt),
              createdAt: updatedAt,
              sortOrder: 0,
            });
          }
        }
        break;
      }
      case "complete":
        if (lockedSession.sessionStatus !== "complete") {
          await updateInterviewSessionState(tx, session.id, {
            sessionStatus: "complete",
            updatedAt,
            completedAt: lockedSession.completedAt ?? updatedAt,
          });

          const currentStudy = await findStudyById(tx, invite.studyId);

          if (
            currentStudy &&
            currentStudy.status !== "completed" &&
            currentStudy.status !== "archived"
          ) {
            await enqueueSessionDebriefJob(tx, invite.studyId, session.id, updatedAt);
          }
        }
        break;
      default:
        throw new ApiError(400, "Unsupported session action.");
    }

    await touchStudy(tx, invite.studyId, updatedAt);
    await refreshStudyStatus(tx, invite.studyId, updatedAt);
    await refreshStudyAggregate(tx, invite.studyId);
  });

  const refreshedSession = await findSessionById(db, session.id);
  const refreshedProfile = await findParticipantProfileBySessionId(db, session.id);

  if (!refreshedSession || !refreshedProfile) {
    throw new ApiError(500, "Failed to reload interview session.");
  }

  return {
    ok: true,
    participantResponses: refreshedProfile.responses ?? {},
    sessionStatus: refreshedSession.sessionStatus,
  };
}
