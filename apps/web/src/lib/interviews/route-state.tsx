import type { ReactNode } from "react";

import { redirect } from "next/navigation";

import { InterviewInviteState } from "@/components/interviews/invite-state";
import { getInterviewPath, getRedirectPathForStep } from "@/lib/interviews/helpers";
import { getInterviewRouteState } from "@/lib/interviews/session";
import type {
  InterviewRouteState,
  InterviewStep,
} from "@/lib/interviews/types";
import { getUnavailableCopy } from "@/lib/interviews/unavailable-copy";

type TerminalInterviewPageResolution = {
  content: ReactNode;
  kind: "terminal";
};

type InviteReadyInterviewRouteState = Extract<
  InterviewRouteState,
  { kind: "invite-ready" }
>;

type ReadyInterviewRouteState = Extract<InterviewRouteState, { kind: "ready" }>;

type ResolvedWelcomeInterviewPage =
  | TerminalInterviewPageResolution
  | InviteReadyInterviewRouteState
  | ReadyInterviewRouteState;

type ResolvedInterviewStepPage =
  | TerminalInterviewPageResolution
  | ReadyInterviewRouteState;

type TerminalInterviewRouteState = Extract<
  InterviewRouteState,
  { kind: "expired" | "invalid" | "unavailable" }
>;

function isTerminalInterviewRouteState(
  routeState: InterviewRouteState,
): routeState is TerminalInterviewRouteState {
  return (
    routeState.kind === "invalid" ||
    routeState.kind === "expired" ||
    routeState.kind === "unavailable"
  );
}

function renderTerminalInterviewRouteState(
  routeState: TerminalInterviewRouteState,
): TerminalInterviewPageResolution {
  if (routeState.kind === "invalid") {
    return {
      content: (
        <InterviewInviteState
          title="Invite not found"
          description="This interview link is invalid or no longer exists. Double check the URL or request a new invite."
        />
      ),
      kind: "terminal",
    };
  }

  if (routeState.kind === "expired") {
    return {
      content: (
        <InterviewInviteState
          variant="expired"
          title="This invite has expired"
          description="The interview window for this participant link has closed. Ask the research team for a fresh invite if you still need to take part."
        />
      ),
      kind: "terminal",
    };
  }

  return {
    content: (
      <InterviewInviteState
        variant="unavailable"
        title="Interview unavailable"
        description={getUnavailableCopy(routeState.reason)}
      />
    ),
    kind: "terminal",
  };
}

export async function resolveInterviewIndexPage(
  inviteCode: string,
): Promise<TerminalInterviewPageResolution> {
  const routeState = await getInterviewRouteState(inviteCode);

  if (isTerminalInterviewRouteState(routeState)) {
    return renderTerminalInterviewRouteState(routeState);
  }

  if (routeState.kind === "invite-ready") {
    redirect(getInterviewPath(routeState.invite.inviteCode, "welcome"));
  }

  redirect(
    getInterviewPath(routeState.invite.inviteCode, routeState.session.sessionStatus),
  );
}

export async function resolveInterviewStepPage(
  inviteCode: string,
  requestedStep: "welcome",
): Promise<ResolvedWelcomeInterviewPage>;
export async function resolveInterviewStepPage(
  inviteCode: string,
  requestedStep: Exclude<InterviewStep, "welcome">,
): Promise<ResolvedInterviewStepPage>;
export async function resolveInterviewStepPage(
  inviteCode: string,
  requestedStep: InterviewStep,
): Promise<ResolvedWelcomeInterviewPage | ResolvedInterviewStepPage> {
  const routeState = await getInterviewRouteState(inviteCode);

  if (isTerminalInterviewRouteState(routeState)) {
    return renderTerminalInterviewRouteState(routeState);
  }

  if (routeState.kind === "invite-ready") {
    if (requestedStep !== "welcome") {
      redirect(getInterviewPath(routeState.invite.inviteCode, "welcome"));
    }

    return routeState;
  }

  const redirectPath = getRedirectPathForStep(
    routeState.invite.inviteCode,
    routeState.session.sessionStatus,
    requestedStep,
  );

  if (redirectPath) {
    redirect(redirectPath);
  }

  return routeState;
}
