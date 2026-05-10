import { redirect } from "next/navigation";

import { InterviewInviteState } from "@/components/interviews/invite-state";
import { getInterviewPath } from "@/lib/interviews/helpers";
import { getInterviewRouteState } from "@/lib/interviews/session";

export default async function InterviewIndexPage({
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

  redirect(
    getInterviewPath(routeState.invite.inviteCode, routeState.session.sessionStatus),
  );
}
