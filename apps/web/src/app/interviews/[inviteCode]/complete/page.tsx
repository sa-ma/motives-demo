import { redirect } from "next/navigation";

import { CompleteScreen } from "@/components/interviews/complete-screen";
import { InterviewInviteState } from "@/components/interviews/invite-state";
import { InterviewPublicShell } from "@/components/interviews/participant-shell";
import { getRedirectPathForStep } from "@/lib/interviews/helpers";
import { getInterviewRouteState } from "@/lib/interviews/session";
import { getUnavailableCopy } from "@/lib/interviews/unavailable-copy";

export default async function InterviewCompletePage({
  params,
  searchParams,
}: {
  params: Promise<{ inviteCode: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { inviteCode } = await params;
  const resolvedSearchParams = searchParams ? await searchParams : undefined;
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
    "complete",
  );

  if (redirectPath) {
    redirect(redirectPath);
  }

  return (
    <InterviewPublicShell>
      <CompleteScreen
        variant={
          resolvedSearchParams?.source === "finished"
            ? "finished"
            : "already-completed"
        }
      />
    </InterviewPublicShell>
  );
}
