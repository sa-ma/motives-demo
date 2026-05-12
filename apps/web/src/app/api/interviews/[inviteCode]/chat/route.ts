export const dynamic = "force-dynamic";

import { cookies } from "next/headers";

import {
  getInterviewSessionCookieName,
  INTERVIEW_SESSION_TOKEN_HEADER,
} from "@/lib/interviews/session-token";

function getApiBaseUrl() {
  return process.env.API_BASE_URL ?? process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:3001";
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ inviteCode: string }> },
) {
  const { inviteCode } = await params;
  const sessionToken = (await cookies()).get(getInterviewSessionCookieName(inviteCode))?.value;
  const upstreamResponse = await fetch(
    `${getApiBaseUrl().replace(/\/$/, "")}/v1/public/interviews/${inviteCode}/chat`,
    {
      body: await request.text(),
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

  return new Response(upstreamResponse.body, {
    headers: upstreamResponse.headers,
    status: upstreamResponse.status,
    statusText: upstreamResponse.statusText,
  });
}
