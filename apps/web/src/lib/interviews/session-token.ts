const INTERVIEW_SESSION_COOKIE_PREFIX = "motives_interview_session";

export function getInterviewSessionCookieName(inviteCode: string) {
  return `${INTERVIEW_SESSION_COOKIE_PREFIX}_${inviteCode.toUpperCase()}`;
}

export const INTERVIEW_SESSION_TOKEN_HEADER = "x-interview-session-token";
