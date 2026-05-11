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
  try {
    return await getServerApiClient().publicInterviews.get(inviteCode);
  } catch (error) {
    if (
      error instanceof ApiError &&
      typeof error.payload === "object" &&
      error.payload !== null &&
      "kind" in error.payload
    ) {
      return error.payload as PublicInterviewRouteState;
    }

    throw error;
  }
}
