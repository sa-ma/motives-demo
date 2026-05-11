import { notFound } from "next/navigation";

import { InterviewPlanPage } from "@/components/studies/interview-plan-page";
import {
  getInitialStudyDetail,
  getInitialStudyPlan,
  getInitialStudyPlanGenerationStatus,
} from "@/lib/api/server";

export default async function StudyPlanRoute({
  params,
}: {
  params: Promise<{ studyId: string }>;
}) {
  const { studyId } = await params;
  const [plan, planGenerationStatus, studyDetail] = await Promise.all([
    getInitialStudyPlan(studyId),
    getInitialStudyPlanGenerationStatus(studyId),
    getInitialStudyDetail(studyId),
  ]);

  if (!studyDetail) {
    notFound();
  }

  return (
    <InterviewPlanPage
      initialStudyDetail={studyDetail}
      initialStudyPlanGenerationStatus={planGenerationStatus}
      plan={plan}
      studyId={studyId}
    />
  );
}
