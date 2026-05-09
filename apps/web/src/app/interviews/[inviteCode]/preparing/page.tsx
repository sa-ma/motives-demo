import { redirect } from "next/navigation";

import { InterviewInviteState } from "@/components/interviews/invite-state";
import { InterviewPublicShell } from "@/components/interviews/participant-shell";
import { PreparingScreen } from "@/components/interviews/preparing-screen";
import { getRedirectPathForStep } from "@/lib/interviews/mock";
import { getInterviewRouteState } from "@/lib/interviews/session";

export default async function InterviewPreparingPage({
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
    "preparing",
  );

  if (redirectPath) {
    redirect(redirectPath);
  }

  return (
    <InterviewPublicShell>
      <PreparingScreen inviteCode={routeState.invite.inviteCode} />
    </InterviewPublicShell>
  );
}
