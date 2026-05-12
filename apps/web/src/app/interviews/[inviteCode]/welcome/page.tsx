import { InterviewPublicShell } from "@/components/interviews/participant-shell";
import { WelcomeScreen } from "@/components/interviews/welcome-screen";
import { resolveInterviewStepPage } from "@/lib/interviews/route-state";

export default async function InterviewWelcomePage({
  params,
}: {
  params: Promise<{ inviteCode: string }>;
}) {
  const { inviteCode } = await params;
  const resolvedPage = await resolveInterviewStepPage(inviteCode, "welcome");

  if (resolvedPage.kind === "terminal") {
    return resolvedPage.content;
  }

  return (
    <InterviewPublicShell>
      <WelcomeScreen invite={resolvedPage.invite} />
    </InterviewPublicShell>
  );
}
