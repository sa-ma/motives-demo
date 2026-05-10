import { redirect } from "next/navigation";

import { InterviewInviteState } from "@/components/interviews/invite-state";
import { InterviewPublicShell } from "@/components/interviews/participant-shell";
import { WelcomeScreen } from "@/components/interviews/welcome-screen";
import { getRedirectPathForStep } from "@/lib/interviews/helpers";
import { getInterviewRouteState } from "@/lib/interviews/session";

export default async function InterviewWelcomePage({
  params,
}: {
  params: Promise<{ inviteCode: string }>;
}) {
  const { inviteCode } = await params;
  const routeState = await getInterviewRouteState(inviteCode);

  if (routeState.kind === "invalid") {
    return (
      <InterviewInviteState
        title="Invite not found"
        description="This interview link is invalid or no longer exists. Double check the URL or request a new invite."
      />
    );
  }

  if (routeState.kind === "expired") {
    return (
      <InterviewInviteState
        variant="expired"
        title="This invite has expired"
        description="The interview window for this participant link has closed. Ask the research team for a fresh invite if you still need to take part."
      />
    );
  }

  const redirectPath = getRedirectPathForStep(
    routeState.invite.inviteCode,
    routeState.session.sessionStatus,
    "welcome",
  );

  if (redirectPath) {
    redirect(redirectPath);
  }

  return (
    <InterviewPublicShell>
      <WelcomeScreen invite={routeState.invite} />
    </InterviewPublicShell>
  );
}
