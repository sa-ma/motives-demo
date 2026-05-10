import { createApiClient } from "@motives-ai/contracts/client";

import { getInterviewRouteStateFromApi } from "@/lib/api/server";
import type {
  InterviewRouteState,
  InterviewSessionState,
  InterviewSessionStatus,
  ParticipantResponses,
  PublicInterviewActionInput,
} from "@/lib/interviews/types";

type StoredInterviewSession = {
  participantResponses?: ParticipantResponses;
  sessionStatus?: InterviewSessionStatus;
};

function getServerSideApiClient() {
  return createApiClient({
    baseUrl:
      process.env.API_BASE_URL ??
      process.env.NEXT_PUBLIC_API_BASE_URL ??
      "http://localhost:3001",
    fetch: (input, init) =>
      fetch(input, {
        ...init,
        cache: "no-store",
      }),
  });
}

export async function getInterviewRouteState(
  inviteCode: string,
): Promise<InterviewRouteState> {
  return getInterviewRouteStateFromApi(inviteCode);
}

export async function updateInterviewSession(
  inviteCode: string,
  patch: StoredInterviewSession,
) {
  let action: PublicInterviewActionInput["action"] | null = null;
  let consentAccepted: boolean | undefined;

  switch (patch.sessionStatus) {
    case "details":
      action = "advance-to-details";
      break;
    case "preparing":
      action = "submit-details";
      consentAccepted = true;
      break;
    case "room":
      action = "start-room";
      break;
    case "complete":
      action = "complete";
      break;
    default:
      action = null;
      break;
  }

  if (!action) {
    return;
  }

  await getServerSideApiClient().publicInterviews.act(inviteCode, {
    action,
    consentAccepted,
    participantResponses: patch.participantResponses,
  });
}

export async function clearInterviewSession(_inviteCode: string) {
  return;
}

export function buildSessionResponse(session: InterviewSessionState) {
  return {
    participantResponses: session.participantResponses,
    sessionStatus: session.sessionStatus,
  };
}
