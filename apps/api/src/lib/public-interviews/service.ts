import { createHash, randomBytes, randomUUID } from "node:crypto";

import type {
  InterviewInvitePayload,
  InterviewMessage,
  InterviewMessageMetadata,
  InterviewProgressState,
  InterviewSessionState,
  ParticipantIntakeField,
  ParticipantResponses,
  PublicInterviewActionInput,
  PublicInterviewActionResponse,
  PublicInterviewRouteState,
} from "@motives-ai/contracts";
import type { StudyPlan } from "@motives-ai/contracts";

import type { AppDatabase, DatabaseExecutor } from "../../db/client.js";
import { enqueueSessionDebriefJob } from "../analysis/queue.js";
import {
  createInterviewSession,
  createParticipantProfile,
  findParticipantProfileBySessionId,
  findSessionByBrowserSessionTokenHash,
  findSessionById,
  findStudyInviteByCode,
  updateInterviewSessionState,
  updateParticipantProfileBySessionId,
} from "../../db/repositories/invites.js";
import { findCurrentApprovedPlan } from "../../db/repositories/plans.js";
import {
  findAnnotationByAssistantTurnId,
  findLatestSessionAnnotation,
  findNextTranscriptTurn,
  findTranscriptTurnByClientMessageId,
  getNextTranscriptSortOrder,
  hasTranscriptTurns,
  insertSessionAnnotation,
  insertTranscriptTurn,
  listTranscriptForSession,
  lockInterviewSession,
} from "../../db/repositories/public-interviews.js";
import {
  countSessions,
  expireIdleSessionById,
  expireIdleSessionsForStudy,
  findParticipantFields,
  findStudyById,
  lockStudy,
  touchStudy,
} from "../../db/repositories/studies.js";
import { ApiError } from "../errors.js";
import type { InterviewCoverageState } from "../interview-coverage.js";
import {
  createInitialCoverageState,
  deriveProgressStateFromCoverageState,
  normalizeCoverageState,
} from "../interview-coverage.js";
import { formatEstimatedInterviewDuration } from "../study-plan-derived.js";
import { refreshStudyAggregate, refreshStudyStatus } from "../studies/state.js";

const DEFAULT_FORMAT_LABEL = "Conversational interview";
const DEFAULT_INTRO_COPY =
  "You're invited to take part in an AI-led research interview. The interviewer will ask about your experiences and opinions, and you can skip any question at any time.";
const DEFAULT_CONSENT_COPY =
  "I understand this is an AI-led research interview and my responses may be analyzed for research purposes.";
const SESSION_TIMEOUT_MS = 60 * 60 * 1000;
export const INTERVIEW_SESSION_TOKEN_HEADER = "x-interview-session-token";

type SharedInviteRow = NonNullable<Awaited<ReturnType<typeof findStudyInviteByCode>>>;
type InviteRef = {
  inviteCode: string;
  studyId: string;
};

type UnavailableInterviewReason =
  | "active-cap-reached"
  | "study-closed"
  | "target-reached";

type PreparedPublicInterviewChatTurn =
  | {
      assistantMetadata: InterviewMessageMetadata;
      assistantTurn: InterviewMessage;
      kind: "replay";
    }
  | {
      inviteCode: string;
      coverageState: InterviewCoverageState;
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

type PublicInterviewActionResult = {
  issuedSessionToken?: string;
  response: PublicInterviewActionResponse;
};

type SessionScope =
  {
      invite: InviteRef;
      kind: "shared";
      sessionId: string;
    };

function resolveParticipantFields(
  fields: ParticipantIntakeField[],
): ParticipantIntakeField[] {
  const legacyFieldIds = new Set(["studyExperience", "usedBudgetingAppRecently"]);
  return fields.filter((field) => !legacyFieldIds.has(field.id));
}

function nowIso() {
  return new Date().toISOString();
}

function getSessionTimeoutCutoff(reference = Date.now()) {
  return new Date(reference - SESSION_TIMEOUT_MS).toISOString();
}

function isStudyClosed(
  study: NonNullable<Awaited<ReturnType<typeof findStudyById>>>,
) {
  return study.status === "archived" || study.status === "completed";
}

function isInviteExpired(invite: { expiresAt: string; revokedAt: string | null }) {
  return invite.revokedAt !== null || new Date(invite.expiresAt).getTime() <= Date.now();
}

function toDisplayTimestamp(value: string) {
  return new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}

function createPrefixedId(prefix: string) {
  return `${prefix}_${randomUUID().replaceAll("-", "")}`;
}

function createBrowserSessionToken() {
  return randomBytes(24).toString("base64url");
}

function hashBrowserSessionToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

function normalizeSessionCoverageState(
  topicLabels: string[],
  coverageState: InterviewCoverageState,
) {
  return normalizeCoverageState(topicLabels, coverageState);
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

async function getInviteRoutePayload(
  db: DatabaseExecutor,
  invite: InviteRef,
): Promise<InterviewInvitePayload> {
  const study = await findStudyById(db, invite.studyId);

  if (!study) {
    throw new ApiError(404, "Study not found.", "STUDY_NOT_FOUND");
  }

  const approvedPlan = await findCurrentApprovedPlan(db, study.id);

  if (!approvedPlan) {
    throw new ApiError(409, "Approved plan not found for invite.", "APPROVED_PLAN_NOT_FOUND");
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

async function buildReadyRouteState(
  db: DatabaseExecutor,
  invite: InviteRef,
  session: NonNullable<Awaited<ReturnType<typeof findSessionById>>>,
): Promise<PublicInterviewRouteState> {
  const invitePayload = await getInviteRoutePayload(db, invite);
  const [latestAnnotation, profile, transcript] = await Promise.all([
    findLatestSessionAnnotation(db, session.id),
    findParticipantProfileBySessionId(db, session.id),
    getTranscript(db, session.id),
  ]);
  const participantResponses = profile?.responses ?? {};
  const coverageState = latestAnnotation
    ? normalizeSessionCoverageState(
        invitePayload.topicLabels,
        latestAnnotation.coverageState,
      )
    : createInitialCoverageState(invitePayload.topicLabels);
  const sessionState: InterviewSessionState = {
    inviteCode: invite.inviteCode,
    participantResponses,
    progressState: deriveProgressStateFromCoverageState(coverageState),
    sessionStatus: session.sessionStatus,
    transcript,
  };

  return {
    invite: invitePayload,
    kind: "ready",
    session: sessionState,
  };
}

async function expireSessionIfIdle(
  db: DatabaseExecutor,
  sessionId: string,
) {
  const updatedAt = nowIso();
  await expireIdleSessionById(db, {
    cutoff: getSessionTimeoutCutoff(),
    sessionId,
    updatedAt,
  });
  return findSessionById(db, sessionId);
}

async function resolveSharedScopedSession(
  db: DatabaseExecutor,
  invite: SharedInviteRow,
  sessionToken?: string,
) {
  if (!sessionToken) {
    return null;
  }

  const session = await findSessionByBrowserSessionTokenHash(
    db,
    hashBrowserSessionToken(sessionToken),
  );

  if (!session || session.studyId !== invite.studyId) {
    return null;
  }

  return expireSessionIfIdle(db, session.id);
}

async function buildUnavailableOrReadySharedState(
  db: AppDatabase,
  invite: SharedInviteRow,
  study: NonNullable<Awaited<ReturnType<typeof findStudyById>>>,
): Promise<PublicInterviewRouteState> {
  const updatedAt = nowIso();
  await expireIdleSessionsForStudy(db, {
    cutoff: getSessionTimeoutCutoff(),
    studyId: invite.studyId,
    updatedAt,
  });

  const [counts, payload] = await Promise.all([
    countSessions(db, invite.studyId),
    getInviteRoutePayload(db, {
      inviteCode: invite.inviteCode,
      studyId: invite.studyId,
    }),
  ]);

  let reason: UnavailableInterviewReason | null = null;

  if (isStudyClosed(study)) {
    reason = "study-closed";
  } else if (counts.completed >= study.interviewsTarget) {
    reason = "target-reached";
  } else if ((counts.completed + counts.active) >= study.interviewsTarget) {
    reason = "active-cap-reached";
  }

  if (reason) {
    return {
      invite: payload,
      kind: "unavailable",
      reason,
    };
  }

  return {
    invite: payload,
    kind: "invite-ready",
  };
}

async function getSharedInviteRouteState(
  db: AppDatabase,
  invite: SharedInviteRow,
  sessionToken?: string,
): Promise<PublicInterviewRouteState> {
  const payload = await getInviteRoutePayload(db, {
    inviteCode: invite.inviteCode,
    studyId: invite.studyId,
  });

  const session = await resolveSharedScopedSession(db, invite, sessionToken);

  if (session && session.sessionStatus !== "expired") {
    return buildReadyRouteState(db, {
      inviteCode: invite.inviteCode,
      studyId: invite.studyId,
    }, session);
  }

  if (isInviteExpired(invite)) {
    return {
      invite: payload,
      kind: "expired",
    };
  }

  const study = await findStudyById(db, invite.studyId);

  if (!study) {
    throw new ApiError(404, "Study not found.", "STUDY_NOT_FOUND");
  }

  return buildUnavailableOrReadySharedState(db, invite, study);
}

async function resolveSessionScope(
  db: AppDatabase,
  inviteCode: string,
  sessionToken?: string,
): Promise<SessionScope | null> {
  const sharedInvite = await findStudyInviteByCode(db, inviteCode);

  if (sharedInvite) {
    const session = await resolveSharedScopedSession(db, sharedInvite, sessionToken);

    if (!session || session.sessionStatus === "expired") {
      return null;
    }

    return {
      invite: {
        inviteCode: sharedInvite.inviteCode,
        studyId: sharedInvite.studyId,
      },
      kind: "shared",
      sessionId: session.id,
    };
  }

  return null;
}

async function prepareChatForSession(
  tx: DatabaseExecutor,
  scope: SessionScope,
  input: {
    clientMessageId: string;
    userText: string;
  },
): Promise<PreparedPublicInterviewChatTurn> {
  await lockInterviewSession(tx, scope.sessionId);

  const lockedSession = await findSessionById(tx, scope.sessionId);
  const profile = await findParticipantProfileBySessionId(tx, scope.sessionId);
  const study = await findStudyById(tx, scope.invite.studyId);
  const approvedPlan = await findCurrentApprovedPlan(tx, scope.invite.studyId);

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
    scope.sessionId,
    input.clientMessageId,
  );

  let userTurn = existingUserTurn;
  const createdAt = nowIso();

  if (!userTurn) {
    const nextSortOrder = await getNextTranscriptSortOrder(tx, scope.sessionId);
    userTurn = await insertTranscriptTurn(tx, {
      clientMessageId: input.clientMessageId,
      createdAt,
      finishReason: null,
      id: createPrefixedId("turn"),
      model: null,
      providerResponseId: null,
      role: "user",
      sessionId: scope.sessionId,
      sortOrder: nextSortOrder,
      text: input.userText,
      timestampLabel: toDisplayTimestamp(createdAt),
    });
  }

  await updateInterviewSessionState(tx, scope.sessionId, {
    lastActivityAt: createdAt,
    updatedAt: createdAt,
  });

  const transcript = await listTranscriptForSession(tx, scope.sessionId);
  const latestAnnotation = await findLatestSessionAnnotation(tx, scope.sessionId);
  const nextTurn = await findNextTranscriptTurn(tx, scope.sessionId, userTurn.sortOrder);
  const baseCoverageState = latestAnnotation
    ? normalizeSessionCoverageState(
        approvedPlan.topics,
        latestAnnotation.coverageState,
      )
    : createInitialCoverageState(approvedPlan.topics);
  const baseProgressState = deriveProgressStateFromCoverageState(baseCoverageState);

  if (nextTurn?.role === "assistant") {
    const nextAnnotation = await findAnnotationByAssistantTurnId(tx, nextTurn.id);
    const assistantTurn = mapTranscriptTurnToMessage(nextTurn);
    const coverageState = nextAnnotation
      ? normalizeSessionCoverageState(
          approvedPlan.topics,
          nextAnnotation.coverageState,
        )
      : baseCoverageState;
    const progressState = deriveProgressStateFromCoverageState(coverageState);

    return {
      assistantMetadata: buildAssistantMetadata(progressState, assistantTurn),
      assistantTurn,
      kind: "replay",
    };
  }

  return {
    coverageState: baseCoverageState,
    inviteCode: scope.invite.inviteCode,
    kind: "generate",
    participantResponses: profile.responses ?? {},
    plan: approvedPlan,
    progressState: baseProgressState,
    sessionId: scope.sessionId,
    study,
    topicLabels: approvedPlan.topics,
    transcript,
    userTurn,
  };
}

async function performSessionAction(
  tx: DatabaseExecutor,
  scope: SessionScope,
  input: PublicInterviewActionInput,
): Promise<PublicInterviewActionResponse> {
  await lockInterviewSession(tx, scope.sessionId);

  const lockedSession = await findSessionById(tx, scope.sessionId);
  const lockedProfile = await findParticipantProfileBySessionId(tx, scope.sessionId);

  if (!lockedSession || !lockedProfile) {
    throw new ApiError(500, "Interview session state is missing.");
  }

  const updatedAt = nowIso();

  switch (input.action) {
    case "advance-to-details":
      if (lockedSession.sessionStatus === "welcome") {
        await updateInterviewSessionState(tx, scope.sessionId, {
          lastActivityAt: updatedAt,
          sessionStatus: "details",
          updatedAt,
        });
      }
      break;
    case "submit-details": {
      if (!input.consentAccepted) {
        throw new ApiError(400, "Consent is required before continuing.");
      }

      await updateParticipantProfileBySessionId(tx, scope.sessionId, {
        responses: input.participantResponses ?? {},
        consentAccepted: true,
        consentedAt: lockedProfile.consentedAt ?? updatedAt,
      });

      if (
        lockedSession.sessionStatus === "welcome" ||
        lockedSession.sessionStatus === "details" ||
        lockedSession.sessionStatus === "preparing"
      ) {
        await updateInterviewSessionState(tx, scope.sessionId, {
          lastActivityAt: updatedAt,
          sessionStatus: "preparing",
          updatedAt,
        });
      }
      break;
    }
    case "start-room": {
      const approvedPlan = await findCurrentApprovedPlan(tx, scope.invite.studyId);

      if (!approvedPlan) {
        throw new ApiError(409, "Approved plan not found for this interview.");
      }

      if (
        lockedSession.sessionStatus === "welcome" ||
        lockedSession.sessionStatus === "details" ||
        lockedSession.sessionStatus === "preparing"
      ) {
        await updateInterviewSessionState(tx, scope.sessionId, {
          lastActivityAt: updatedAt,
          sessionStatus: "room",
          updatedAt,
        });
      }

      if (lockedSession.sessionStatus !== "complete") {
        const existingTurn = await hasTranscriptTurns(tx, scope.sessionId);

        if (!existingTurn) {
          await insertTranscriptTurn(tx, {
            id: createPrefixedId("turn"),
            sessionId: scope.sessionId,
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
        await updateInterviewSessionState(tx, scope.sessionId, {
          completedAt: lockedSession.completedAt ?? updatedAt,
          lastActivityAt: updatedAt,
          sessionStatus: "complete",
          updatedAt,
        });

        const currentStudy = await findStudyById(tx, scope.invite.studyId);

        if (
          currentStudy &&
          currentStudy.status !== "completed" &&
          currentStudy.status !== "archived"
        ) {
          await enqueueSessionDebriefJob(tx, scope.invite.studyId, scope.sessionId, updatedAt);
        }
      }
      break;
    default:
      throw new ApiError(400, "Unsupported session action.");
  }

  await touchStudy(tx, scope.invite.studyId, updatedAt);
  await refreshStudyStatus(tx, scope.invite.studyId, updatedAt);
  await refreshStudyAggregate(tx, scope.invite.studyId);

  const refreshedSession = await findSessionById(tx, scope.sessionId);
  const refreshedProfile = await findParticipantProfileBySessionId(tx, scope.sessionId);

  if (!refreshedSession || !refreshedProfile) {
    throw new ApiError(500, "Failed to reload interview session.");
  }

  return {
    ok: true,
    participantResponses: refreshedProfile.responses ?? {},
    sessionStatus: refreshedSession.sessionStatus,
  };
}

async function createSharedInviteSession(
  tx: DatabaseExecutor,
  invite: SharedInviteRow,
): Promise<{
  response: PublicInterviewActionResponse;
  issuedSessionToken: string;
}> {
  await lockStudy(tx, invite.studyId);

  const updatedAt = nowIso();
  await expireIdleSessionsForStudy(tx, {
    cutoff: getSessionTimeoutCutoff(),
    studyId: invite.studyId,
    updatedAt,
  });

  const [study, approvedPlan, counts] = await Promise.all([
    findStudyById(tx, invite.studyId),
    findCurrentApprovedPlan(tx, invite.studyId),
    countSessions(tx, invite.studyId),
  ]);

  if (!study) {
    throw new ApiError(404, "Study not found.", "STUDY_NOT_FOUND");
  }

  if (isStudyClosed(study)) {
    throw new ApiError(409, "This study is no longer accepting interviews.", "STUDY_CLOSED");
  }

  if (!approvedPlan) {
    throw new ApiError(409, "Approved plan not found for this interview.", "APPROVED_PLAN_NOT_FOUND");
  }

  if (counts.completed >= study.interviewsTarget) {
    throw new ApiError(409, "Interview target reached.", "TARGET_REACHED");
  }

  if ((counts.completed + counts.active) >= study.interviewsTarget) {
    throw new ApiError(409, "All interview slots are currently occupied.", "ACTIVE_INTERVIEW_CAP_REACHED");
  }

  const sessionId = createPrefixedId("session");
  const profileId = createPrefixedId("profile");
  const participantNumber = counts.total + 1;
  const browserSessionToken = createBrowserSessionToken();
  const browserSessionTokenHash = hashBrowserSessionToken(browserSessionToken);

  await createInterviewSession(tx, {
    browserSessionTokenHash,
    completedAt: null,
    createdAt: updatedAt,
    id: sessionId,
    lastActivityAt: updatedAt,
    participantNumber,
    sessionStatus: "details",
    studyId: invite.studyId,
    updatedAt,
  });

  await createParticipantProfile(tx, {
    consentAccepted: false,
    consentedAt: null,
    id: profileId,
    responses: {},
    sessionId,
  });

  await touchStudy(tx, invite.studyId, updatedAt);
  await refreshStudyStatus(tx, invite.studyId, updatedAt);
  await refreshStudyAggregate(tx, invite.studyId);

  return {
    issuedSessionToken: browserSessionToken,
    response: {
      ok: true,
      participantResponses: {},
      sessionStatus: "details",
    },
  };
}

export async function getPublicInterviewRouteState(
  db: AppDatabase,
  inviteCode: string,
  sessionToken?: string,
): Promise<PublicInterviewRouteState> {
  const sharedInvite = await findStudyInviteByCode(db, inviteCode);

  if (sharedInvite) {
    return getSharedInviteRouteState(db, sharedInvite, sessionToken);
  }

  return {
    inviteCode: inviteCode.toUpperCase(),
    kind: "invalid",
  };
}

export async function preparePublicInterviewChatTurn(
  db: AppDatabase,
  inviteCode: string,
  input: {
    clientMessageId: string;
    userText: string;
  },
  sessionToken?: string,
): Promise<PreparedPublicInterviewChatTurn> {
  const sharedInvite = await findStudyInviteByCode(db, inviteCode);

  if (sharedInvite) {
    const scope = await resolveSessionScope(db, inviteCode, sessionToken);

    if (scope) {
      return db.transaction(async (tx) => prepareChatForSession(tx, scope, input));
    }

    if (isInviteExpired(sharedInvite)) {
      throw new ApiError(410, "Interview invite has expired.", "INVITE_EXPIRED");
    }

    if (!scope) {
      throw new ApiError(409, "Interview session is not active.", "INTERVIEW_SESSION_INACTIVE");
    }
  }

  throw new ApiError(404, "Interview invite is not available.", "INVITE_NOT_FOUND");
}

export async function finalizePublicInterviewChatTurn(
  db: AppDatabase,
  prepared: Extract<PreparedPublicInterviewChatTurn, { kind: "generate" }>,
  input: {
    annotation: {
      contradictions: string[];
      coverageState: InterviewCoverageState;
      emotionSignal: "low" | "medium" | "high";
      evidenceQuotes: string[];
    };
    assistantTurnId: string;
    finishReason: string;
    model: string;
    providerResponseId?: string;
    text: string;
  },
): Promise<FinalizedPublicInterviewChatTurn> {
  const createdAt = nowIso();
  const coverageState = normalizeSessionCoverageState(
    prepared.topicLabels,
    input.annotation.coverageState,
  );
  const progressState = deriveProgressStateFromCoverageState(coverageState);
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
      coverageState,
      progressState,
      sessionId: prepared.sessionId,
      userTurnId: prepared.userTurn.id,
    });

    await updateInterviewSessionState(tx, prepared.sessionId, {
      lastActivityAt: createdAt,
      updatedAt: createdAt,
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
  sessionToken?: string,
): Promise<PublicInterviewActionResult> {
  const sharedInvite = await findStudyInviteByCode(db, inviteCode);

  if (sharedInvite) {
    const existingScope = await resolveSessionScope(db, inviteCode, sessionToken);

    if (existingScope) {
      return {
        response: await db.transaction(async (tx) => performSessionAction(tx, existingScope, input)),
      };
    }

    if (isInviteExpired(sharedInvite)) {
      throw new ApiError(410, "Interview invite has expired.", "INVITE_EXPIRED");
    }

    if (input.action === "advance-to-details") {
      return db.transaction(async (tx) => createSharedInviteSession(tx, sharedInvite));
    }

    throw new ApiError(409, "Interview session is not active.", "INTERVIEW_SESSION_INACTIVE");
  }

  throw new ApiError(404, "Interview invite is not available.");
}
