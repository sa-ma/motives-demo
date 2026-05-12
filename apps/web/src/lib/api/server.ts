import { cookies } from "next/headers";

import { ApiError, createApiClient } from "@motives-ai/contracts/client";
import type {
  ListStudiesQuery,
  PublicInterviewRouteState,
  SessionDebriefResponse,
  StudyDetail,
  StudyPlan,
  StudyPlanGenerationResponse,
  StudySummary,
} from "@motives-ai/contracts";
import {
  getInterviewSessionCookieName,
  INTERVIEW_SESSION_TOKEN_HEADER,
} from "@/lib/interviews/session-token";

function getServerApiBaseUrl() {
  return process.env.API_BASE_URL ?? process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:3001";
}

function getServerApiClient() {
  return createApiClient({
    baseUrl: getServerApiBaseUrl(),
    fetch: (input, init) =>
      fetch(input, {
        ...init,
        cache: "no-store",
      }),
  });
}

export async function getInitialStudyDetail(studyId: string): Promise<StudyDetail | null> {
  try {
    return await getServerApiClient().studies.detail(studyId);
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) {
      return null;
    }

    throw error;
  }
}

export async function getInitialStudies(
  query: ListStudiesQuery = {},
): Promise<StudySummary[]> {
  return getServerApiClient().studies.list(query);
}

export async function getInitialStudyPlan(studyId: string): Promise<StudyPlan | null> {
  try {
    return await getServerApiClient().plans.get(studyId);
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) {
      return null;
    }

    throw error;
  }
}

export async function getInitialStudyPlanGenerationStatus(
  studyId: string,
): Promise<StudyPlanGenerationResponse | null> {
  try {
    return await getServerApiClient().plans.status(studyId);
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) {
      return null;
    }

    throw error;
  }
}

export async function getInitialSessionDebrief(
  studyId: string,
  sessionId: string,
): Promise<SessionDebriefResponse | null> {
  try {
    return await getServerApiClient().studies.debrief(studyId, sessionId);
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) {
      return null;
    }

    throw error;
  }
}

export async function getInterviewRouteStateFromApi(
  inviteCode: string,
): Promise<PublicInterviewRouteState> {
  const sessionToken = (await cookies()).get(getInterviewSessionCookieName(inviteCode))?.value;
  const response = await fetch(
    `${getServerApiBaseUrl().replace(/\/$/, "")}/v1/public/interviews/${inviteCode}`,
    {
      cache: "no-store",
      headers: sessionToken
        ? {
            [INTERVIEW_SESSION_TOKEN_HEADER]: sessionToken,
          }
        : undefined,
    },
  );
  const payload = (await response.json()) as PublicInterviewRouteState;

  if (!response.ok && payload.kind !== "invalid" && payload.kind !== "expired") {
    throw new ApiError("Failed to load interview state.", response.status, payload);
  }

  return payload;
}
