import { notFound } from "next/navigation";

import { StudyDetailPage } from "@/components/studies/study-detail-page";
import { getStudyDetailById } from "@/components/studies/study-detail.mock";

export default async function StudyDetailRoute({
  params,
}: {
  params: Promise<{ studyId: string }>;
}) {
  const { studyId } = await params;
  const study = getStudyDetailById(studyId);

  if (!study) {
    notFound();
  }

  return <StudyDetailPage study={study} />;
}
