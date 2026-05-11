import { notFound } from "next/navigation";

import { InterviewPlanPage } from "@/components/studies/interview-plan-page";
import { getInitialStudyDetail, getInitialStudyPlan } from "@/lib/api/server";

export default async function StudyPlanRoute({
  params,
  searchParams,
}: {
  params: Promise<{ studyId: string }>;
  searchParams: Promise<{ generate?: string }>;
}) {
  const { studyId } = await params;
  const { generate } = await searchParams;
  const [plan, studyDetail] = await Promise.all([
    getInitialStudyPlan(studyId),
    getInitialStudyDetail(studyId),
  ]);

  if (!studyDetail) {
    notFound();
  }

  return (
    <InterviewPlanPage
      autoGenerateOnMount={generate === "1" && !plan}
      initialStudyDetail={studyDetail}
      plan={plan}
      studyId={studyId}
    />
  );
}
