import { redirect } from "next/navigation";

import { InterviewInviteState } from "@/components/interviews/invite-state";
import { ParticipantDetailsForm } from "@/components/interviews/participant-details-form";
import { InterviewPublicShell } from "@/components/interviews/participant-shell";
import { getRedirectPathForStep } from "@/lib/interviews/helpers";
import { getInterviewRouteState } from "@/lib/interviews/session";
import { getUnavailableCopy } from "@/lib/interviews/unavailable-copy";

export default async function InterviewDetailsPage({
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

  if (routeState.kind === "unavailable") {
    return (
      <InterviewInviteState
        variant="unavailable"
        title="Interview unavailable"
        description={getUnavailableCopy(routeState.reason)}
      />
    );
  }

  if (routeState.kind === "invite-ready") {
    redirect(`/interviews/${routeState.invite.inviteCode}/welcome`);
  }

  const redirectPath = getRedirectPathForStep(
    routeState.invite.inviteCode,
    routeState.session.sessionStatus,
    "details",
  );

  if (redirectPath) {
    redirect(redirectPath);
  }

  return (
    <InterviewPublicShell>
      <ParticipantDetailsForm
        initialValues={routeState.session.participantResponses}
        invite={routeState.invite}
      />
    </InterviewPublicShell>
  );
}
