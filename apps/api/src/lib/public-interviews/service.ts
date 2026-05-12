import { randomUUID } from "node:crypto";

import type {
  InterviewInvitePayload,
  InterviewMessage,
  InterviewMessageMetadata,
  InterviewProgressState,
  InterviewSessionState,
  InterviewSessionStatus,
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
  findInviteWithSession,
  findParticipantProfileBySessionId,
  findSessionById,
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
  findParticipantFields,
  findStudyById,
  touchStudy,
} from "../../db/repositories/studies.js";
import { ApiError } from "../errors.js";
import { buildFallbackInterviewProgressState } from "../interview-progress.js";
import { formatEstimatedInterviewDuration } from "../study-plan-derived.js";
import { refreshStudyAggregate, refreshStudyStatus } from "../studies/state.js";

const DEFAULT_FORMAT_LABEL = "Conversational interview";
const DEFAULT_INTRO_COPY =
  "You're invited to take part in an AI-led research interview. The interviewer will ask about your experiences and opinions, and you can skip any question at any time.";
const DEFAULT_CONSENT_COPY =
  "I understand this is an AI-led research interview and my responses may be analyzed for research purposes.";

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

function createPrefixedId(prefix: string) {
  return `${prefix}_${randomUUID().replaceAll("-", "")}`;
}

async function getInviteRoutePayload(
  db: DatabaseExecutor,
  invite: NonNullable<Awaited<ReturnType<typeof findInviteWithSession>>>["invite"],
  sessionStatus: InterviewSessionStatus,
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
