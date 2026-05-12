import { resolveInterviewIndexPage } from "@/lib/interviews/route-state";

export default async function InterviewIndexPage({
  params,
}: {
  params: Promise<{ inviteCode: string }>;
}) {
  const { inviteCode } = await params;
  const resolvedPage = await resolveInterviewIndexPage(inviteCode);
  return resolvedPage.content;
}
