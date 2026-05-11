import type {
  CreateInviteInput,
  CreateInviteResponse,
} from "./invites.js";
import type {
  ApprovePlanResponse,
  GeneratePlanInput,
  StudyPlan,
  UpdateStudyPlanInput,
} from "./plans.js";
import type {
  PublicInterviewActionInput,
  PublicInterviewActionResponse,
  PublicInterviewRouteState,
} from "./public-interviews.js";
import type {
  ArchiveStudyResponse,
  CreateStudyInput,
  CreateStudyResponse,
  EndStudyResponse,
  ListStudiesQuery,
  SessionDebriefResponse,
  StudyDetail,
  StudySummary,
} from "./studies.js";

type FetchLike = typeof fetch;

export class ApiError extends Error {
  readonly status: number;
  readonly payload: unknown;
  readonly code?: string;

  constructor(message: string, status: number, payload: unknown, code?: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.payload = payload;
    this.code = code;
  }
}

type RequestOptions = {
  body?: unknown;
  headers?: HeadersInit;
  method?: string;
};

export type ApiClient = ReturnType<typeof createApiClient>;

export function createApiClient(options: {
  baseUrl: string;
  fetch?: FetchLike;
}) {
  const fetchImpl = options.fetch ?? fetch;
  const baseUrl = options.baseUrl.replace(/\/$/, "");

  async function request<T>(path: string, init: RequestOptions = {}) {
    const response = await fetchImpl(`${baseUrl}${path}`, {
      body:
        init.body === undefined ? undefined : JSON.stringify(init.body),
      headers: {
        "Content-Type": "application/json",
        ...init.headers,
      },
      method: init.method ?? "GET",
    });

    const text = await response.text();
    const payload = text ? (JSON.parse(text) as unknown) : null;

    if (!response.ok) {
      const code =
        typeof payload === "object" &&
        payload !== null &&
        "code" in payload &&
        typeof payload.code === "string"
          ? payload.code
          : undefined;
      const message =
        typeof payload === "object" &&
        payload !== null &&
        "message" in payload &&
        typeof payload.message === "string"
          ? payload.message
          : typeof payload === "object" &&
              payload !== null &&
              "error" in payload &&
              typeof payload.error === "string"
            ? payload.error
            : `Request failed with status ${response.status}`;

      throw new ApiError(message, response.status, payload, code);
    }

    return payload as T;
  }

  function appendQuery(
    path: string,
    query?: Record<string, string | undefined>,
  ) {
    if (!query) {
      return path;
    }

    const params = new URLSearchParams();

    for (const [key, value] of Object.entries(query)) {
      if (!value) {
        continue;
      }

      params.set(key, value);
    }

    const serialized = params.toString();

    return serialized ? `${path}?${serialized}` : path;
  }

  return {
    studies: {
      create(input: CreateStudyInput) {
        return request<CreateStudyResponse>("/v1/studies", {
          body: input,
          method: "POST",
        });
      },
      list(query: ListStudiesQuery = {}) {
        return request<StudySummary[]>(
          appendQuery("/v1/studies", {
            q: query.q?.trim() || undefined,
            sort: query.sort,
            status: query.status,
          }),
        );
      },
      detail(studyId: string) {
        return request<StudyDetail>(`/v1/studies/${studyId}`);
      },
      end(studyId: string) {
        return request<EndStudyResponse>(`/v1/studies/${studyId}/end`, {
          body: {},
          method: "POST",
        });
      },
      archive(studyId: string) {
        return request<ArchiveStudyResponse>(`/v1/studies/${studyId}/archive`, {
          body: {},
          method: "POST",
        });
      },
      debrief(studyId: string, sessionId: string) {
        return request<SessionDebriefResponse>(
          `/v1/studies/${studyId}/interviews/${sessionId}/debrief`,
        );
      },
    },
    plans: {
      get(studyId: string) {
        return request<StudyPlan>(`/v1/studies/${studyId}/plan`);
      },
      generate(studyId: string, input: GeneratePlanInput = {}) {
        return request<StudyPlan>(`/v1/studies/${studyId}/plan/generate`, {
          body: input,
          method: "POST",
        });
      },
      update(studyId: string, input: UpdateStudyPlanInput) {
        return request<StudyPlan>(`/v1/studies/${studyId}/plan`, {
          body: input,
          method: "PUT",
        });
      },
      approve(studyId: string) {
        return request<ApprovePlanResponse>(`/v1/studies/${studyId}/plan/approve`, {
          body: {},
          method: "POST",
        });
      },
    },
    invites: {
      create(studyId: string, input: CreateInviteInput = {}) {
        return request<CreateInviteResponse>(`/v1/studies/${studyId}/invites`, {
          body: input,
          method: "POST",
        });
      },
    },
    publicInterviews: {
      get(inviteCode: string) {
        return request<PublicInterviewRouteState>(`/v1/public/interviews/${inviteCode}`);
      },
      act(inviteCode: string, input: PublicInterviewActionInput) {
        return request<PublicInterviewActionResponse>(
          `/v1/public/interviews/${inviteCode}/actions`,
          {
            body: input,
            method: "POST",
          },
        );
      },
    },
  };
}
