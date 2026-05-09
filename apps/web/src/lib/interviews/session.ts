import { cookies } from "next/headers";

import {
  buildInitialTranscript,
  buildInterviewInvitePayload,
  buildInterviewProgressState,
  getDefaultInterviewSessionStatus,
} from "@/lib/interviews/mock";
import type {
  InterviewRouteState,
  InterviewSessionState,
  InterviewSessionStatus,
} from "@/lib/interviews/types";

const SESSION_COOKIE_NAME = "motives-interview-session";

type StoredInterviewSession = {
  participantResponses?: Record<string, boolean | string>;
  sessionStatus?: InterviewSessionStatus;
};

type StoredInterviewSessionMap = Record<string, StoredInterviewSession>;

function parseStoredSessions(rawValue: string | undefined) {
  if (!rawValue) {
    return {};
  }

  try {
    const parsed = JSON.parse(rawValue) as StoredInterviewSessionMap;

    if (!parsed || typeof parsed !== "object") {
      return {};
    }

    return parsed;
  } catch {
    return {};
  }
}

async function readStoredSessions() {
  const cookieStore = await cookies();
  return parseStoredSessions(cookieStore.get(SESSION_COOKIE_NAME)?.value);
}

async function writeStoredSessions(nextSessions: StoredInterviewSessionMap) {
  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE_NAME, JSON.stringify(nextSessions), {
    httpOnly: true,
    maxAge: 60 * 60 * 6,
    path: "/",
    sameSite: "lax",
  });
}

export async function getInterviewRouteState(
  inviteCode: string,
): Promise<InterviewRouteState> {
  const normalizedInviteCode = inviteCode.toUpperCase();
  const defaultSessionStatus = getDefaultInterviewSessionStatus(normalizedInviteCode);

  if (!defaultSessionStatus) {
    return {
      inviteCode: normalizedInviteCode,
      kind: "invalid",
    };
  }

  const storedSessions = await readStoredSessions();
  const storedSession = storedSessions[normalizedInviteCode];
  const sessionStatus =
    storedSession?.sessionStatus ?? defaultSessionStatus;
  const invite = buildInterviewInvitePayload(normalizedInviteCode, sessionStatus);

  if (!invite) {
    return {
      inviteCode: normalizedInviteCode,
      kind: "invalid",
    };
  }

  if (sessionStatus === "expired") {
    return {
      invite,
      kind: "expired",
    };
  }

  const transcript = buildInitialTranscript();
  const answerCount = transcript.filter((message) => message.role === "user").length;

  return {
    invite,
    kind: "ready",
    session: {
      inviteCode: normalizedInviteCode,
      participantResponses: storedSession?.participantResponses ?? {},
      progressState: buildInterviewProgressState(invite.topicLabels, answerCount),
      sessionStatus,
      transcript,
    },
  };
}

export async function updateInterviewSession(
  inviteCode: string,
  patch: StoredInterviewSession,
) {
  const normalizedInviteCode = inviteCode.toUpperCase();
  const storedSessions = await readStoredSessions();
  const currentSession = storedSessions[normalizedInviteCode] ?? {};

  storedSessions[normalizedInviteCode] = {
    participantResponses: {
      ...(currentSession.participantResponses ?? {}),
      ...(patch.participantResponses ?? {}),
    },
    sessionStatus: patch.sessionStatus ?? currentSession.sessionStatus,
  };

  await writeStoredSessions(storedSessions);
}

export async function clearInterviewSession(inviteCode: string) {
  const normalizedInviteCode = inviteCode.toUpperCase();
  const storedSessions = await readStoredSessions();

  delete storedSessions[normalizedInviteCode];

  await writeStoredSessions(storedSessions);
}

export function buildSessionResponse(session: InterviewSessionState) {
  return {
    participantResponses: session.participantResponses,
    sessionStatus: session.sessionStatus,
  };
}
