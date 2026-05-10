import { randomUUID } from "node:crypto";

import type {
  CreateInviteResponse,
  CreateStudyInput,
  CreateStudyResponse,
  InterviewInvitePayload,
  InterviewMessage,
  InterviewProgressState,
  InterviewSessionState,
  InterviewSessionStatus,
  ParticipantIntakeField,
  ParticipantResponses,
  PublicInterviewActionInput,
  PublicInterviewActionResponse,
  PublicInterviewRouteState,
  StudyDetail,
  StudySessionItem,
  StudyStatus,
  StudySummary,
  UpdateStudyPlanInput,
} from "@motives-ai/contracts";
import type { ApprovePlanResponse, StudyPlan } from "@motives-ai/contracts";

import type { AppDatabase, DatabaseExecutor } from "../db/client.js";
import {
  createInterviewInvite,
  createInterviewSession,
  createInviteCode,
  createParticipantProfile,
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
  hasTranscriptTurns,
  insertTranscriptTurn,
  listTranscriptForSession,
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

const DEFAULT_ESTIMATED_DURATION = "10 min";
const DEFAULT_FORMAT_LABEL = "Conversational interview";
const DEFAULT_INTRO_COPY =
  "You're invited to take part in an AI-led research interview. The interviewer will ask about your experiences and opinions, and you can skip any question at any time.";
const DEFAULT_CONSENT_COPY =
  "I understand this is an AI-led research interview and my responses may be analyzed for research purposes.";

const DEFAULT_PARTICIPANT_FIELDS: ParticipantIntakeField[] = [
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
  {
    id: "usedBudgetingAppRecently",
    label: "Have you used a budgeting app in the last 6 months?",
    options: [
      { label: "Yes", value: "yes" },
      { label: "No", value: "no" },
    ],
    required: true,
    type: "radio",
  },
];

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

function buildInterviewProgressState(
  topicLabels: string[],
  answerCount: number,
): InterviewProgressState {
  const clampedCount = Math.max(0, answerCount);
  const coveredCount =
    clampedCount <= 1 ? 0 : Math.min(clampedCount - 1, topicLabels.length);
  const activeIndex = coveredCount >= topicLabels.length ? null : coveredCount;

  return {
    activeTopicLabel:
      activeIndex === null ? null : topicLabels[activeIndex] ?? null,
    completionRatio:
      topicLabels.length === 0
        ? 0
        : Math.min(
            (coveredCount + (activeIndex !== null ? 0.5 : 1)) / topicLabels.length,
            1,
          ),
    coveredTopicLabels: topicLabels.slice(0, coveredCount),
    remainingTopicLabels: activeIndex === null ? [] : topicLabels.slice(activeIndex + 1),
  };
}

function generatePlanFromStudy(
  study: Awaited<ReturnType<typeof findStudyById>> extends infer T
    ? NonNullable<T>
    : never,
  baseTopics: string[],
): StudyPlan {
  const normalizedTopics = normalizeTopics(baseTopics);
  const focusTopics = normalizedTopics.length > 0 ? normalizedTopics : ["Core workflow"];
  const expandedTopics = normalizeTopics([
    ...focusTopics,
    "Key moments of friction or hesitation",
    "How value changes over time",
  ]).slice(0, 6);
  const contextSubject = study.context || study.title;

  return {
    studyId: study.id,
    title: study.title,
    subtitle: "AI-generated plan tailored to your research objective",
    objective: study.objective,
    hypotheses: [
      `${study.title} loses momentum when participant expectations do not match the lived experience.`,
      "Emotional friction and perceived lack of progress reduce motivation to return.",
      "Trust and clarity become more important after the first moments of use.",
      "The long-term value is not obvious enough to sustain the habit over time.",
    ],
    topics: expandedTopics,
    openingQuestion: `Can you walk me through your experience with ${contextSubject} and what made you try it in the first place?`,
    probingStrategy: [
      "Ask for specific moments, behaviors, and examples rather than opinions alone.",
      "Probe emotional language when the participant describes friction or hesitation.",
      "Double-click on what changed over time before moving to solutions.",
      "Stay neutral and let the participant define what success or failure looked like.",
    ],
    exampleProbes: [
      "What was going through your mind at that moment?",
      "Can you walk me through what happened next?",
      "What felt useful, confusing, or frustrating there?",
      "What would have needed to change for you to keep going?",
    ],
    mustCoverAreas: focusTopics.slice(0, 3),
    thingsToAvoid: [
      "Leading questions",
      "Deep implementation details",
      "Competitor comparisons unless the participant raises them first",
    ],
    selectedBehaviorId: "ask-for-examples",
    selectedTone: "Conversational and empathetic",
  };
}

function computeStudyStatus(
  study: Awaited<ReturnType<typeof findStudyById>> extends infer T ? NonNullable<T> : never,
  counts: Awaited<ReturnType<typeof countSessions>>,
): StudyStatus {
  if (counts.completed >= study.interviewsTarget && counts.completed > 0) {
    return "completed";
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
    return "This study has completed its current interview target. Debrief generation is deferred until the next phase.";
  }

  if (status === "interviewing") {
    if (liveSessions > 0) {
      return "Participant sessions are in progress and their state now persists through the API.";
    }

    if (completedSessions > 0) {
      return "Completed sessions are accumulating and the study is ready for richer analysis in the next phase.";
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

async function refreshStudyStatus(
  db: DatabaseExecutor,
  studyId: string,
  updatedAt = nowIso(),
) {
  const study = await findStudyById(db, studyId);

  if (!study) {
    throw new ApiError(404, "Study not found.");
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

  const counts = await countSessions(db, studyId);
  const plan =
    (await findCurrentApprovedPlan(db, studyId)) ??
    (await findCurrentDraftPlan(db, studyId)) ?? {
      topics: await findStudyTopics(db, studyId),
    };
  const topics = normalizeTopics(plan.topics);
  const coverage =
    counts.completed > 0
      ? 100
      : counts.live > 0 && topics.length > 0
        ? Math.max(12, Math.round(100 / topics.length))
        : 0;
  const themes = topics.slice(0, 3);
  const hiddenThemesCount = Math.max(topics.length - themes.length, 0);
  const status = computeStudyStatus(study, counts);
  const observation = buildStudyObservation({
    completedSessions: counts.completed,
    hasApprovedPlan: Boolean(await findCurrentApprovedPlan(db, studyId)),
    liveSessions: counts.live,
    status,
    totalSessions: counts.total,
  });
  const updatedAt = nowIso();

  await upsertStudyAggregate(db, {
    studyId,
    coverage,
    signalCount: 0,
    themes,
    hiddenThemesCount,
    observation,
    updatedAt,
  });
}

async function buildStudySummary(db: DatabaseExecutor, study: NonNullable<Awaited<ReturnType<typeof findStudyById>>>): Promise<StudySummary> {
  await refreshStudyAggregate(db, study.id);

  const [aggregate, approvedPlan, draftPlan, counts] = await Promise.all([
    findStudyAggregate(db, study.id),
    findCurrentApprovedPlan(db, study.id),
    findCurrentDraftPlan(db, study.id),
    countSessions(db, study.id),
  ]);
  const topics =
    approvedPlan?.topics ??
    draftPlan?.topics ??
    (await findStudyTopics(db, study.id));
  const statusLabel = toTitleCase(study.status);

  return {
    id: study.id,
    title: study.title,
    description: study.objective,
    status: study.status,
    statusLabel,
    interviewsCompleted: counts.completed,
    interviewsTarget: study.interviewsTarget,
    coverage: aggregate?.coverage ?? 0,
    signalCount: aggregate?.signalCount ?? 0,
    themeLabel:
      study.status === "planning"
        ? "Planned topics"
        : study.status === "completed"
          ? "Top themes"
          : "Emerging themes",
    themes: aggregate?.themes ?? topics.slice(0, 3),
    hiddenThemesCount:
      aggregate?.hiddenThemesCount ?? Math.max(topics.length - 3, 0),
    observation:
      aggregate?.observation ??
      "This study is ready for plan review. Generate or refine the interview plan before creating invites.",
    updatedLabel: toRelativeLabel(study.updatedAt),
    actionLabel: study.status === "planning" ? "Review Plan" : "Continue Study",
    accent: study.status,
  };
}

async function mapTopicCoverage(
  db: DatabaseExecutor,
  studyId: string,
): Promise<StudyDetail["topicCoverage"]> {
  const approvedPlan = await findCurrentApprovedPlan(db, studyId);
  const draftPlan = await findCurrentDraftPlan(db, studyId);
  const topics =
    approvedPlan?.topics ??
    draftPlan?.topics ??
    (await findStudyTopics(db, studyId));
  const sessions = await listSessionsForStudy(db, studyId);
  const hasCompletedSession = sessions.some((session) => session.sessionStatus === "complete");
  const hasLiveSession = sessions.some((session) => session.sessionStatus === "room");

  return topics.map((topic, index) => ({
    id: `${studyId}-${index}`,
    topic,
    status: hasCompletedSession
      ? "covered"
      : hasLiveSession && index === 0
        ? "in-progress"
        : "not-explored",
    evidence: hasCompletedSession ? 4 : hasLiveSession && index === 0 ? 1 : 0,
  }));
}

function mapSessionItem(
  session: Awaited<ReturnType<typeof listSessionsForStudy>>[number],
  totalTopics: number,
): StudySessionItem {
  const isComplete = session.sessionStatus === "complete";
  const coveredTopics =
    totalTopics === 0
      ? 0
      : isComplete
        ? totalTopics
        : session.sessionStatus === "room"
          ? 1
          : 0;
  const progress =
    totalTopics === 0 ? 0 : Math.round((coveredTopics / totalTopics) * 100);
  const participantLabel = `Participant ${String(session.participantNumber).padStart(2, "0")}`;

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
    emotionalSignal: "low",
    topicsCoveredLabel: `${coveredTopics} / ${totalTopics}`,
    topicsCoveredProgress: progress,
    contradictionsCount: 0,
    actionLabel: isComplete ? "Debrief Pending" : "Continue",
    actionTone: isComplete ? "outline" : "primary",
    debriefAvailable: false,
  };
}

async function mapRecentActivity(
  db: DatabaseExecutor,
  studyId: string,
): Promise<StudyDetail["recentActivity"]> {
  const sessions = await listSessionsForStudy(db, studyId);

  return sessions
    .flatMap<StudyDetail["recentActivity"][number]>((session) => {
      const participantLabel = `Participant ${String(session.participantNumber).padStart(2, "0")}`;

      if (session.sessionStatus === "complete" && session.completedAt) {
        return [
          {
            id: `complete-${session.id}`,
            type: "session-complete",
            title: `${participantLabel} completed the interview`,
            timestamp: toRelativeLabel(session.completedAt, "").replace(/^ /, ""),
          },
        ];
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
      study.durationMinutes > 0
        ? `${study.durationMinutes} min`
        : DEFAULT_ESTIMATED_DURATION,
    formatLabel: DEFAULT_FORMAT_LABEL,
    introCopy: DEFAULT_INTRO_COPY,
    inviteCode: invite.inviteCode,
    participantFields: await findParticipantFields(db, study.id),
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

  return rows.map((row) => ({
    id: row.id,
    role: row.role,
    text: row.text,
    timestampLabel: row.timestampLabel,
  }));
}

export async function createStudy(
  db: AppDatabase,
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
      durationMinutes: input.durationMinutes,
      status: "planning",
      interviewsTarget: 10,
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
      DEFAULT_PARTICIPANT_FIELDS.map((field, index) => ({
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
    study: await buildStudySummary(db, study),
  };
}

export async function listStudies(db: AppDatabase): Promise<StudySummary[]> {
  const rows = await listStudiesOrdered(db);
  return Promise.all(rows.map((row) => buildStudySummary(db, row)));
}

export async function getStudyDetail(
  db: AppDatabase,
  studyId: string,
): Promise<StudyDetail> {
  const study = await findStudyById(db, studyId);

  if (!study) {
    throw new ApiError(404, "Study not found.");
  }

  await refreshStudyAggregate(db, studyId);
  const [aggregate, approvedPlan, draftPlan, sessions, counts, topicCoverage, recentActivity] =
    await Promise.all([
      findStudyAggregate(db, studyId),
      findCurrentApprovedPlan(db, studyId),
      findCurrentDraftPlan(db, studyId),
      listSessionsForStudy(db, studyId),
      countSessions(db, studyId),
      mapTopicCoverage(db, studyId),
      mapRecentActivity(db, studyId),
    ]);
  const topics =
    approvedPlan?.topics ??
    draftPlan?.topics ??
    (await findStudyTopics(db, studyId));

  return {
    studyId: study.id,
    title: study.title,
    description: study.objective,
    statusLabel: toTitleCase(study.status),
    canStartInterview: Boolean(approvedPlan),
    metadata: {
      createdLabel: toRelativeLabel(study.createdAt, "Created"),
      interviewDurationLabel: `${study.durationMinutes} min interviews`,
      audienceLabel: study.audience,
      interviewCountLabel: `${study.interviewsTarget} interviews`,
    },
    metrics: [
      {
        id: "interview-progress",
        label: "Interview Progress",
        value: `${counts.completed} / ${study.interviewsTarget}`,
        subtitle: "Interviews completed",
        progress: Math.round((counts.completed / study.interviewsTarget) * 100),
        progressLabel: `${Math.round((counts.completed / study.interviewsTarget) * 100)}%`,
        tone: "primary",
      },
      {
        id: "topic-coverage",
        label: "Topic Coverage",
        value: `${topicCoverage.filter((item) => item.status === "covered").length} / ${topicCoverage.length}`,
        subtitle: "Research topics explored",
        progress: topicCoverage.length === 0 ? 0 : aggregate?.coverage ?? 0,
        progressLabel: `${aggregate?.coverage ?? 0}%`,
        tone: "success",
      },
      {
        id: "strong-signals",
        label: "Strong Signals",
        value: String(aggregate?.signalCount ?? 0),
        subtitle: "Emotional moments detected",
        tone: "warning",
      },
      {
        id: "contradictions",
        label: "Contradictions",
        value: "0",
        subtitle: "Contradictions surfaced",
        tone: "violet",
      },
    ],
    insightThemes: aggregate?.themes ?? topics.slice(0, 3),
    aiObservation:
      aggregate?.observation ??
      "This study is ready for plan review. Generate or refine the interview plan before creating invites.",
    topicCoverage,
    sessions: sessions.map((session) => mapSessionItem(session, topics.length)),
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
): Promise<StudyPlan> {
  const study = await findStudyById(db, studyId);

  if (!study) {
    throw new ApiError(404, "Study not found.");
  }

  const topics = await findStudyTopics(db, studyId);
  const plan = generatePlanFromStudy(study, topics);
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
  const draftRow = await findCurrentPlanVersion(db, studyId, "draft");

  if (!draftRow) {
    throw new ApiError(409, "A draft plan must exist before it can be edited.");
  }

  const existingPlan = draftRow.content;

  const nextPlan: StudyPlan = {
    ...existingPlan,
    ...input,
    topics: normalizeTopics(input.topics),
    mustCoverAreas: normalizeTopics(input.mustCoverAreas),
    thingsToAvoid: normalizeTopics(input.thingsToAvoid),
  };

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
  const draftRow = await findCurrentPlanVersion(db, studyId, "draft");

  if (!draftRow) {
    throw new ApiError(409, "A draft plan is required before approval.");
  }

  const draftPlan = draftRow.content;
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

  const approvedPlan = await findCurrentApprovedPlan(db, studyId);

  if (!approvedPlan) {
    throw new ApiError(409, "An approved plan is required before creating an invite.");
  }

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
    inviteUrl: `${appBaseUrl.replace(/\/$/, "")}/interviews/${inviteCode}/welcome`,
    expiresAt,
    sessionId,
  };
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

  const [profile, transcript, invitePayload] = await Promise.all([
    findParticipantProfileBySessionId(db, session.id),
    getTranscript(db, session.id),
    getInviteRoutePayload(db, invite, session.sessionStatus),
  ]);
  const answerCount = transcript.filter((message) => message.role === "user").length;
  const participantResponses = profile?.responses ?? {};
  const sessionState: InterviewSessionState = {
    inviteCode: invite.inviteCode,
    participantResponses,
    progressState: buildInterviewProgressState(invitePayload.topicLabels, answerCount),
    sessionStatus: session.sessionStatus,
    transcript,
  };

  return {
    invite: invitePayload,
    kind: "ready",
    session: sessionState,
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
