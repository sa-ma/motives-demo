import { randomUUID } from "node:crypto";

import type {
  ArchiveStudyResponse,
  CreateInviteResponse,
  CreateStudyInput,
  CreateStudyResponse,
  EndStudyResponse,
  InterviewProgressState,
  ListStudiesQuery,
  ParticipantIntakeField,
  SessionDebriefResponse,
  StudyDetail,
  StudySessionItem,
  StudySummary,
} from "@motives-ai/contracts";
import type { StudyPlan } from "@motives-ai/contracts";

import type { AppDatabase, DatabaseExecutor } from "../../db/client.js";
import {
  cancelQueuedAnalysisJobsForStudy,
  findDebriefReportBySessionId,
  findLatestAnalysisJob,
  listDebriefReportsForStudy,
  listLatestAnalysisJobsForSessions,
} from "../../db/repositories/analysis.js";
import {
  createInviteCode,
  createStudyInvite as createStudyInviteRow,
  findActiveStudyInviteForStudy,
  findSessionById,
  listActiveStudyInvitesForStudies,
  revokeExpiredStudyInvitesForStudy,
} from "../../db/repositories/invites.js";
import {
  findCurrentApprovedPlan,
  findCurrentDraftPlan,
  listCurrentPlanVersionsByStudyIds,
} from "../../db/repositories/plans.js";
import {
  listLatestSessionAnnotationsForSessions,
  listTranscriptForSessions,
} from "../../db/repositories/public-interviews.js";
import {
  countSessions,
  countSessionsByStudyIds,
  createUniqueStudyId,
  expireIdleSessionsForStudy,
  findStudyAggregate,
  findStudyById,
  findStudyTopics,
  insertParticipantFields,
  insertStudy,
  insertStudyTopics,
  listStudyAggregatesByStudyIds,
  listSessionsForStudy,
  listStudiesOrdered,
  listStudyTopicsByStudyIds,
  lockStudy,
  touchStudy,
  updateStudyStatus,
} from "../../db/repositories/studies.js";
import { enqueueStudyPlanGenerationJob } from "../analysis/queue.js";
import { ApiError } from "../errors.js";
import { buildFallbackInterviewProgressState } from "../interview-progress.js";
import { debriefResponseFromRow } from "../study-analysis.js";
import {
  InvalidGeneratedStudyPlanError,
  validateStudyPlan,
} from "../study-plan-validation.js";
import { hydrateStudyPlanDerivedFields } from "../study-plan-derived.js";
import { refreshStudyAggregate } from "./state.js";

const PENDING_ANALYSIS_OBSERVATION =
  "Completed interviews are waiting for AI debrief analysis. Signals, contradictions, and topic coverage will appear after processing finishes.";
const FAILED_ANALYSIS_OBSERVATION =
  "We could not finish AI debrief analysis for the completed interviews yet. Retry the queue to populate signals, contradictions, and topic coverage.";

type StudySummaryContext = {
  aggregateByStudyId: Map<string, Awaited<ReturnType<typeof findStudyAggregate>>>;
  approvedPlanByStudyId: Map<string, StudyPlan>;
  countsByStudyId: Map<string, Awaited<ReturnType<typeof countSessions>>>;
  draftPlanByStudyId: Map<string, StudyPlan>;
  latestInviteByStudyId: Map<
    string,
    Awaited<ReturnType<typeof listActiveStudyInvitesForStudies>>[number]
  >;
  topicsByStudyId: Map<string, string[]>;
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

function isUniqueViolationError(error: unknown) {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === "23505"
  );
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
        "STUDY_PLAN_INVALID",
      );
    }

    throw error;
  }
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

function normalizeProgressState(
  topicLabels: string[],
  progressState: InterviewProgressState,
) {
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

function buildStudySummary(
  appBaseUrl: string,
  study: NonNullable<Awaited<ReturnType<typeof findStudyById>>>,
  context: StudySummaryContext,
): StudySummary {
  const aggregate = context.aggregateByStudyId.get(study.id);
  const approvedPlan = context.approvedPlanByStudyId.get(study.id);
  const draftPlan = context.draftPlanByStudyId.get(study.id);
  const counts = context.countsByStudyId.get(study.id) ?? {
    active: 0,
    completed: 0,
    live: 0,
    total: 0,
  };
  const latestInvite = context.latestInviteByStudyId.get(study.id);
  const topics =
    approvedPlan?.topics ??
    draftPlan?.topics ??
    context.topicsByStudyId.get(study.id) ??
    [];
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
    activeInviteUrl: latestInvite
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

async function loadStudySummaryContext(
  db: DatabaseExecutor,
  studies: Array<NonNullable<Awaited<ReturnType<typeof findStudyById>>>>,
): Promise<StudySummaryContext> {
  const studyIds = studies.map((study) => study.id);
  const currentTime = nowIso();
  const [aggregates, countRows, latestInvites, planRows] = await Promise.all([
    listStudyAggregatesByStudyIds(db, studyIds),
    countSessionsByStudyIds(db, studyIds),
    listActiveStudyInvitesForStudies(db, {
      now: currentTime,
      studyIds,
    }),
    listCurrentPlanVersionsByStudyIds(db, studyIds),
  ]);

  const aggregateByStudyId = new Map(
    aggregates.map((aggregate) => [aggregate.studyId, aggregate]),
  );
  const approvedPlanByStudyId = new Map<string, StudyPlan>();
  const countsByStudyId = new Map(
    countRows.map((counts) => [
      counts.studyId,
      {
        active: counts.active,
        completed: counts.completed,
        live: counts.live,
        total: counts.total,
      },
    ]),
  );
  const draftPlanByStudyId = new Map<string, StudyPlan>();
  const latestInviteByStudyId = new Map<
    string,
    (typeof latestInvites)[number]
  >();

  for (const planRow of planRows) {
    const plan = hydrateStudyPlanDerivedFields(planRow.content);

    if (planRow.kind === "approved") {
      approvedPlanByStudyId.set(planRow.studyId, plan);
      continue;
    }

    draftPlanByStudyId.set(planRow.studyId, plan);
  }

  for (const invite of latestInvites) {
    if (!latestInviteByStudyId.has(invite.studyId)) {
      latestInviteByStudyId.set(invite.studyId, invite);
    }
  }

  const topicFallbackStudyIds = studies
    .filter(
      (study) =>
        !approvedPlanByStudyId.has(study.id) &&
        !draftPlanByStudyId.has(study.id),
    )
    .map((study) => study.id);
  const topicRows = await listStudyTopicsByStudyIds(db, topicFallbackStudyIds);
  const topicsByStudyId = new Map<string, string[]>();

  for (const row of topicRows) {
    const topics = topicsByStudyId.get(row.studyId);

    if (topics) {
      topics.push(row.label);
      continue;
    }

    topicsByStudyId.set(row.studyId, [row.label]);
  }

  return {
    aggregateByStudyId,
    approvedPlanByStudyId,
    countsByStudyId,
    draftPlanByStudyId,
    latestInviteByStudyId,
    topicsByStudyId,
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
            : session.sessionStatus === "welcome"
              ? "Invite Created"
              : session.sessionStatus === "room"
                ? "Interview Live"
                : "Participant Started";
    const stateLabel = isComplete
      ? "Completed"
      : session.sessionStatus === "welcome"
        ? "Invite Created"
        : session.sessionStatus === "room"
          ? "Interview Live"
          : "Participant Started";

    return {
      id: session.id,
      participantLabel,
      participantInitials: `P${session.participantNumber}`,
      state: isComplete ? "completed" : "in-progress",
      stateLabel,
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
            title: `${participantLabel} joined the interview`,
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
            title: `${participantLabel} opened the invite`,
            timestamp: toRelativeLabel(session.updatedAt, "").replace(/^ /, ""),
          },
        ];
      }

      return [];
    })
    .slice(0, 5);
}

export async function createStudy(
  db: AppDatabase,
  appBaseUrl: string,
  input: CreateStudyInput,
): Promise<CreateStudyResponse> {
  const topics = normalizeTopics(input.topics);

  if (topics.length === 0) {
    throw new ApiError(400, "At least one study topic is required.", "STUDY_TOPICS_REQUIRED");
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

    await enqueueStudyPlanGenerationJob(tx, studyId, createdAt);

  });

  const study = await findStudyById(db, studyId);

  if (!study) {
    throw new ApiError(500, "Failed to create study.", "STUDY_CREATE_FAILED");
  }

  const summaryContext = await loadStudySummaryContext(db, [study]);

  return {
    studyId,
    study: buildStudySummary(appBaseUrl, study, summaryContext),
  };
}

export async function listStudies(
  db: AppDatabase,
  appBaseUrl: string,
  query: ListStudiesQuery = {},
): Promise<StudySummary[]> {
  const rows = await listStudiesOrdered(db, query);
  const summaryContext = await loadStudySummaryContext(db, rows);
  return rows.map((row) => buildStudySummary(appBaseUrl, row, summaryContext));
}

export async function getStudyDetail(
  db: AppDatabase,
  appBaseUrl: string,
  studyId: string,
): Promise<StudyDetail> {
  const study = await findStudyById(db, studyId);

  if (!study) {
    throw new ApiError(404, "Study not found.", "STUDY_NOT_FOUND");
  }

  const currentTime = nowIso();
  const [aggregate, approvedPlan, draftPlan, sessions, counts, debriefs, activeInvite] =
    await Promise.all([
      findStudyAggregate(db, studyId),
      findCurrentApprovedPlan(db, studyId),
      findCurrentDraftPlan(db, studyId),
      listSessionsForStudy(db, studyId),
      countSessions(db, studyId),
      listDebriefReportsForStudy(db, studyId),
      findActiveStudyInviteForStudy(db, studyId, currentTime),
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
    activeInviteUrl:
      activeInvite &&
      study.status !== "completed" &&
      study.status !== "archived"
      ? `${appBaseUrl.replace(/\/$/, "")}/interviews/${activeInvite.inviteCode}`
      : undefined,
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

export async function createStudyInvite(
  db: AppDatabase,
  appBaseUrl: string,
  studyId: string,
): Promise<CreateInviteResponse> {
  const study = await findStudyById(db, studyId);

  if (!study) {
    throw new ApiError(404, "Study not found.", "STUDY_NOT_FOUND");
  }

  ensureStudyNotEnded(study, "create new invites");

  const approvedPlan = await findCurrentApprovedPlan(db, studyId);

  if (!approvedPlan) {
    throw new ApiError(409, "An approved plan is required before creating an invite.", "APPROVED_PLAN_REQUIRED");
  }

  ensureStudyPlanIsValid(approvedPlan, "be used to create an invite");

  return db.transaction(async (tx) => {
    await lockStudy(tx, studyId);

    const currentTime = nowIso();
    await revokeExpiredStudyInvitesForStudy(tx, {
      now: currentTime,
      revokedAt: currentTime,
      studyId,
    });

    const existingInvite = await findActiveStudyInviteForStudy(tx, studyId, currentTime);

    if (existingInvite) {
      return {
        inviteCode: existingInvite.inviteCode,
        inviteUrl: `${appBaseUrl.replace(/\/$/, "")}/interviews/${existingInvite.inviteCode}`,
        expiresAt: existingInvite.expiresAt,
      };
    }

    const createdAt = currentTime;
    const inviteId = createPrefixedId("invite");
    const inviteCode = await createInviteCode(tx);
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

    try {
      await createStudyInviteRow(tx, {
        id: inviteId,
        studyId,
        inviteCode,
        createdAt,
        expiresAt,
        revokedAt: null,
      });
    } catch (error) {
      if (isUniqueViolationError(error)) {
        const concurrentInvite = await findActiveStudyInviteForStudy(tx, studyId, currentTime);

        if (concurrentInvite) {
          return {
            inviteCode: concurrentInvite.inviteCode,
            inviteUrl: `${appBaseUrl.replace(/\/$/, "")}/interviews/${concurrentInvite.inviteCode}`,
            expiresAt: concurrentInvite.expiresAt,
          };
        }
      }

      throw error;
    }

    return {
      inviteCode,
      inviteUrl: `${appBaseUrl.replace(/\/$/, "")}/interviews/${inviteCode}`,
      expiresAt,
    };
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
    throw new ApiError(404, "Interview session not found.", "INTERVIEW_SESSION_NOT_FOUND");
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
    throw new ApiError(404, "Study not found.", "STUDY_NOT_FOUND");
  }

  if (study.status === "completed") {
    return {
      ok: true,
      status: "completed",
      studyId,
    };
  }

  const updatedAt = nowIso();

  await db.transaction(async (tx) => {
    await lockStudy(tx, studyId);
    await expireIdleSessionsForStudy(tx, {
      cutoff: new Date(Date.now() - 60 * 60 * 1000).toISOString(),
      studyId,
      updatedAt,
    });

    const counts = await countSessions(tx, studyId);

    if (counts.active > 0) {
      throw new ApiError(409, "All participant sessions must be finished before ending the study.", "ACTIVE_SESSIONS_PREVENT_END");
    }

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
    throw new ApiError(404, "Study not found.", "STUDY_NOT_FOUND");
  }

  if (study.status === "archived") {
    return {
      ok: true,
      status: "archived",
      studyId,
    };
  }

  const updatedAt = nowIso();

  await db.transaction(async (tx) => {
    await lockStudy(tx, studyId);
    await expireIdleSessionsForStudy(tx, {
      cutoff: new Date(Date.now() - 60 * 60 * 1000).toISOString(),
      studyId,
      updatedAt,
    });

    const counts = await countSessions(tx, studyId);

    if (counts.active > 0) {
      throw new ApiError(409, "All participant sessions must be finished before archiving the study.", "ACTIVE_SESSIONS_PREVENT_ARCHIVE");
    }

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
