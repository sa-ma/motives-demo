import Link from "next/link";
import { notFound } from "next/navigation";

import {
  getDebriefTab,
  InterviewDebriefPage,
} from "@/components/interviews/interview-debrief-page";
import { getInitialSessionDebrief } from "@/lib/api/server";

export default async function InterviewDebriefRoute({
  params,
  searchParams,
}: {
  params: Promise<{ studyId: string; sessionId: string }>;
  searchParams: Promise<{ tab?: string | string[] }>;
}) {
  const { studyId, sessionId } = await params;
  const [{ tab }, debriefState] = await Promise.all([
    searchParams,
    getInitialSessionDebrief(studyId, sessionId),
  ]);
  const activeTab = getDebriefTab(tab);

  if (!debriefState) {
    notFound();
  }

  if (debriefState.status === "pending") {
    return (
      <div className="min-h-full bg-[linear-gradient(180deg,rgba(255,255,255,0.97),rgba(248,250,252,0.98))] px-4 py-8 sm:px-6 xl:px-8 2xl:px-12">
        <div className="mx-auto flex max-w-3xl flex-col gap-5 rounded-[24px] border border-zinc-200/80 bg-white/96 p-6 shadow-[0_24px_64px_-40px_rgba(15,23,42,0.24)] sm:p-8">
          <Link
            href={`/studies/${studyId}`}
            className="inline-flex w-fit items-center gap-2 text-sm font-medium text-zinc-600 transition-colors hover:text-zinc-950"
          >
            Back to Study
          </Link>
          <div className="space-y-2">
            <h1 className="font-heading text-[1.8rem] font-semibold tracking-tight text-zinc-950">
              Debrief Pending
            </h1>
            <p className="text-[15px] leading-7 text-zinc-500">
              The interview has completed and the AI debrief is still being generated. Refresh this page in a moment to load the finished analysis.
            </p>
          </div>
        </div>
      </div>
    );
  }

  if (debriefState.status === "failed") {
    return (
      <div className="min-h-full bg-[linear-gradient(180deg,rgba(255,255,255,0.97),rgba(248,250,252,0.98))] px-4 py-8 sm:px-6 xl:px-8 2xl:px-12">
        <div className="mx-auto flex max-w-3xl flex-col gap-5 rounded-[24px] border border-rose-100 bg-white/96 p-6 shadow-[0_24px_64px_-40px_rgba(15,23,42,0.24)] sm:p-8">
          <Link
            href={`/studies/${studyId}`}
            className="inline-flex w-fit items-center gap-2 text-sm font-medium text-zinc-600 transition-colors hover:text-zinc-950"
          >
            Back to Study
          </Link>
          <div className="space-y-2">
            <h1 className="font-heading text-[1.8rem] font-semibold tracking-tight text-zinc-950">
              Debrief Failed
            </h1>
            <p className="text-[15px] leading-7 text-zinc-500">
              {debriefState.error}
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <InterviewDebriefPage
      activeTab={activeTab}
      debrief={debriefState.debrief}
    />
  );
}
