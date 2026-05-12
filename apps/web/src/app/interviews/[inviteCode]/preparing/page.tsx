import { InterviewPublicShell } from "@/components/interviews/participant-shell";
import { PreparingScreen } from "@/components/interviews/preparing-screen";
import { resolveInterviewStepPage } from "@/lib/interviews/route-state";

export default async function InterviewPreparingPage({
  params,
}: {
  params: Promise<{ inviteCode: string }>;
}) {
  const { inviteCode } = await params;
  const resolvedPage = await resolveInterviewStepPage(inviteCode, "preparing");

  if (resolvedPage.kind === "terminal") {
    return resolvedPage.content;
  }

  return (
    <InterviewPublicShell>
      <PreparingScreen inviteCode={resolvedPage.invite.inviteCode} />
    </InterviewPublicShell>
  );
}
