import { notFound } from "next/navigation";

import { StudyDetailPage } from "@/components/studies/study-detail-page";
import { getInitialStudyDetail } from "@/lib/api/server";

export default async function StudyDetailRoute({
  params,
}: {
  params: Promise<{ studyId: string }>;
}) {
  const { studyId } = await params;
  const study = await getInitialStudyDetail(studyId);

  if (!study) {
    notFound();
  }

  return <StudyDetailPage study={study} />;
}
