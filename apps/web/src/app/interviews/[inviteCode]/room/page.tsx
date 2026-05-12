import { InterviewRoom } from "@/components/interviews/interview-room";
import { toInterviewUIMessage } from "@/lib/interviews/helpers";
import { resolveInterviewStepPage } from "@/lib/interviews/route-state";

export default async function InterviewRoomPage({
  params,
}: {
  params: Promise<{ inviteCode: string }>;
}) {
  const { inviteCode } = await params;
  const resolvedPage = await resolveInterviewStepPage(inviteCode, "room");

  if (resolvedPage.kind === "terminal") {
    return resolvedPage.content;
  }

  return (
    <InterviewRoom
      invite={resolvedPage.invite}
      initialMessages={resolvedPage.session.transcript.map(toInterviewUIMessage)}
      initialProgressState={resolvedPage.session.progressState}
    />
  );
}
