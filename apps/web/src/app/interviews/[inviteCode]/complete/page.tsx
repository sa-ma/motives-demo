import { CompleteScreen } from "@/components/interviews/complete-screen";
import { InterviewPublicShell } from "@/components/interviews/participant-shell";
import { resolveInterviewStepPage } from "@/lib/interviews/route-state";

export default async function InterviewCompletePage({
  params,
  searchParams,
}: {
  params: Promise<{ inviteCode: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { inviteCode } = await params;
  const resolvedSearchParams = searchParams ? await searchParams : undefined;
  const resolvedPage = await resolveInterviewStepPage(inviteCode, "complete");

  if (resolvedPage.kind === "terminal") {
    return resolvedPage.content;
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
