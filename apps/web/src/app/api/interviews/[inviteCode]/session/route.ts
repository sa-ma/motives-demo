import { NextResponse } from "next/server";
import { cookies } from "next/headers";

import {
  getInterviewSessionCookieName,
  INTERVIEW_SESSION_TOKEN_HEADER,
} from "@/lib/interviews/session-token";

type SessionAction =
  | "advance-to-details"
  | "complete"
  | "start-room"
  | "submit-details";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ inviteCode: string }> },
) {
  const { inviteCode } = await params;
  const payload = (await request.json().catch(() => ({}))) as {
    action?: SessionAction;
    consentAccepted?: boolean;
    participantResponses?: Record<string, boolean | string>;
  };

  const sessionCookieName = getInterviewSessionCookieName(inviteCode);
  const sessionToken = (await cookies()).get(sessionCookieName)?.value;
  const upstreamResponse = await fetch(
    `${process.env.API_BASE_URL ?? process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:3001"}/v1/public/interviews/${inviteCode}/actions`,
    {
      body: JSON.stringify(payload),
      cache: "no-store",
      headers: {
        "Content-Type": "application/json",
        ...(sessionToken
          ? {
              [INTERVIEW_SESSION_TOKEN_HEADER]: sessionToken,
            }
          : {}),
      },
      method: "POST",
    },
  );
  const responseText = await upstreamResponse.text();
  const nextResponse = new NextResponse(responseText, {
    headers: {
      "Content-Type": "application/json",
    },
    status: upstreamResponse.status,
    statusText: upstreamResponse.statusText,
  });
  const issuedSessionToken = upstreamResponse.headers.get(INTERVIEW_SESSION_TOKEN_HEADER);

  if (issuedSessionToken) {
    nextResponse.cookies.set(sessionCookieName, issuedSessionToken, {
      httpOnly: true,
      path: "/",
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
    });
  }

  return nextResponse;
}
