export class InterviewSessionActionError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "InterviewSessionActionError";
    this.status = status;
  }
}

export async function callInterviewSessionAction(
  inviteCode: string,
  body: Record<string, unknown>,
) {
  const response = await fetch(`/api/interviews/${inviteCode}/session`, {
    body: JSON.stringify(body),
    headers: {
      "Content-Type": "application/json",
    },
    method: "POST",
  });
  const payload = await response.json().catch(() => ({}));

  if (!response.ok) {
    const message =
      typeof payload === "object" &&
      payload !== null &&
      "error" in payload &&
      typeof payload.error === "string"
        ? payload.error
        : `Request failed with status ${response.status}`;

    throw new InterviewSessionActionError(message, response.status);
  }

  return payload;
}
