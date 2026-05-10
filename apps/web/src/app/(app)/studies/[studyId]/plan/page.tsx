import { notFound } from "next/navigation";

import { InterviewPlanPage } from "@/components/studies/interview-plan-page";
import { getInitialStudyPlan } from "@/lib/api/server";

export default async function StudyPlanRoute({
  params,
}: {
  params: Promise<{ studyId: string }>;
}) {
  const { studyId } = await params;
  const plan = await getInitialStudyPlan(studyId);

  if (!plan) {
    notFound();
  }

  return <InterviewPlanPage plan={plan} studyId={studyId} />;
}
