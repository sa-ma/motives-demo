import { notFound } from "next/navigation";

import { InterviewPlanPage } from "@/components/studies/interview-plan-page";
import { getStudyPlanById } from "@/components/studies/study-plans.mock";

export default async function StudyPlanRoute({
  params,
}: {
  params: Promise<{ studyId: string }>;
}) {
  const { studyId } = await params;
  const plan = getStudyPlanById(studyId);

  if (!plan) {
    notFound();
  }

  return <InterviewPlanPage plan={plan} />;
}
