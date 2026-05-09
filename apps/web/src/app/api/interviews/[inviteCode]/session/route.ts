import { NextResponse } from "next/server";

import { getInterviewRouteState, updateInterviewSession } from "@/lib/interviews/session";

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
  const routeState = await getInterviewRouteState(inviteCode);

  if (routeState.kind !== "ready") {
    return NextResponse.json(
      { error: "Interview invite is not available." },
      { status: routeState.kind === "invalid" ? 404 : 410 },
    );
  }

  const payload = (await request.json().catch(() => ({}))) as {
    action?: SessionAction;
    participantResponses?: Record<string, boolean | string>;
  };

  switch (payload.action) {
    case "advance-to-details":
      await updateInterviewSession(inviteCode, { sessionStatus: "details" });
      break;
    case "submit-details":
      await updateInterviewSession(inviteCode, {
        participantResponses: payload.participantResponses ?? {},
        sessionStatus: "preparing",
      });
      break;
    case "start-room":
      await updateInterviewSession(inviteCode, { sessionStatus: "room" });
      break;
    case "complete":
      await updateInterviewSession(inviteCode, { sessionStatus: "complete" });
      break;
    default:
      return NextResponse.json(
        { error: "Unsupported session action." },
        { status: 400 },
      );
  }

  const nextRouteState = await getInterviewRouteState(inviteCode);

  if (nextRouteState.kind !== "ready") {
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({
    ok: true,
    participantResponses: nextRouteState.session.participantResponses,
    sessionStatus: nextRouteState.session.sessionStatus,
  });
}
