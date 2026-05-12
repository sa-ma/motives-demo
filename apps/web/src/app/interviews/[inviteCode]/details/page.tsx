import { ParticipantDetailsForm } from "@/components/interviews/participant-details-form";
import { InterviewPublicShell } from "@/components/interviews/participant-shell";
import { resolveInterviewStepPage } from "@/lib/interviews/route-state";

export default async function InterviewDetailsPage({
  params,
}: {
  params: Promise<{ inviteCode: string }>;
}) {
  const { inviteCode } = await params;
  const resolvedPage = await resolveInterviewStepPage(inviteCode, "details");

  if (resolvedPage.kind === "terminal") {
    return resolvedPage.content;
  }

  return (
    <InterviewPublicShell>
      <ParticipantDetailsForm
        initialValues={resolvedPage.session.participantResponses}
        invite={resolvedPage.invite}
      />
    </InterviewPublicShell>
  );
}
