import { notFound } from "next/navigation";

import { InterviewDebriefPage } from "@/components/interviews/interview-debrief-page";
import { getInterviewDebriefById } from "@/components/interviews/interview-debrief.mock";

export default async function InterviewDebriefRoute({
  params,
}: {
  params: Promise<{ studyId: string; sessionId: string }>;
}) {
  const { studyId, sessionId } = await params;
  const debrief = getInterviewDebriefById(studyId, sessionId);

  if (!debrief) {
    notFound();
  }

  return <InterviewDebriefPage debrief={debrief} />;
}
