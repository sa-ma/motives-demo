import { notFound } from "next/navigation";

import { InterviewPlanPage } from "@/components/studies/interview-plan-page";
import { getInitialStudyDetail, getInitialStudyPlan } from "@/lib/api/server";

export default async function StudyPlanRoute({
  params,
}: {
  params: Promise<{ studyId: string }>;
}) {
  const { studyId } = await params;
  const [plan, studyDetail] = await Promise.all([
    getInitialStudyPlan(studyId),
    getInitialStudyDetail(studyId),
  ]);

  if (!plan || !studyDetail) {
    notFound();
  }

  return (
    <InterviewPlanPage
      initialStudyDetail={studyDetail}
      plan={plan}
      studyId={studyId}
    />
  );
}
