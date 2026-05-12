"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ApiError } from "@motives-ai/contracts/client";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Clock3, PenLine, RefreshCcw, Sparkles } from "lucide-react";
import { toast } from "sonner";

import type {
  StudyDetail as StudyDetailModel,
  StudyPlan as StudyPlanModel,
  StudyPlanGenerationResponse,
} from "@motives-ai/contracts";

import { EditTopicsDialog } from "@/components/studies/edit-topics-dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { browserApiClient } from "@/lib/api/client";
import { copyTextToClipboard } from "@/lib/clipboard";
import { SERVER_RENDERED_QUERY_STALE_TIME_MS } from "@/lib/query";
import { cn } from "@/lib/utils";

const PLAN_GENERATION_POLL_MS = 2_000;

function PlanColumn({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <Card
      className={cn(
        "rounded-[24px] border-zinc-200/80 bg-white/96 shadow-[0_24px_64px_-40px_rgba(15,23,42,0.24)]",
        className,
      )}
    >
      <CardContent className="p-0">{children}</CardContent>
    </Card>
  );
}

function PlanSection({
  title,
  children,
  className,
}: {
  title: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={cn("px-6 py-5 sm:px-7 sm:py-6", className)}>
      <h2 className="text-[13px] font-semibold tracking-[0.01em] text-primary">
        {title}
      </h2>
      <div className="mt-4">{children}</div>
    </section>
  );
}

function PlanSeparator() {
  return <div className="border-t border-zinc-200/80" aria-hidden="true" />;
}

function NumberedList({
  items,
  bulletTone = "neutral",
}: {
  items: string[];
  bulletTone?: "neutral" | "soft";
}) {
  const bulletClassName =
    bulletTone === "soft"
      ? "border-zinc-200/90 bg-white text-zinc-500"
      : "border-zinc-200 bg-zinc-50 text-zinc-500";

  return (
    <ol className="space-y-4">
      {items.map((item, index) => (
        <li
          key={item}
          className="flex items-start gap-3 text-[14px] leading-7 text-zinc-700 sm:text-[14.5px]"
        >
          <span
            className={cn(
              "mt-1 flex size-6 shrink-0 items-center justify-center rounded-full border text-[12px] font-semibold",
              bulletClassName,
            )}
          >
            {index + 1}
          </span>
          <span className="block flex-1">{item}</span>
        </li>
      ))}
    </ol>
  );
}

function BulletList({
  items,
  className,
  markerClassName = "bg-primary/65",
}: {
  items: string[];
  className?: string;
  markerClassName?: string;
}) {
  return (
    <ul className={cn("space-y-4", className)}>
      {items.map((item) => (
        <li
          key={item}
          className="flex items-start gap-3 text-[14px] leading-7 text-zinc-700 sm:text-[14.5px]"
        >
          <span
            className={cn(
              "mt-[0.72rem] size-1.5 shrink-0 rounded-full",
              markerClassName,
            )}
          />
          <span className="block flex-1">{item}</span>
        </li>
      ))}
    </ul>
  );
}

function ExampleProbeCallout({ items }: { items: string[] }) {
  return (
    <div className="rounded-[20px] border border-primary/12 bg-[linear-gradient(180deg,rgba(248,250,252,0.96),rgba(238,242,255,0.82))] px-5 py-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.8)]">
      <div className="mb-4 flex items-center gap-2.5">
        <div className="flex size-6 items-center justify-center rounded-full bg-white text-primary shadow-[0_10px_24px_-16px_rgba(29,78,216,0.55)]">
          <Sparkles className="size-3.5" />
        </div>
        <p className="text-[13px] font-semibold text-primary">Example Probes</p>
      </div>

      <BulletList
        items={items}
        className="space-y-3"
        markerClassName="bg-primary/55"
      />
    </div>
  );
}

function PlanSkeletonBlock({ className }: { className?: string }) {
  return <div className={cn("animate-pulse rounded-2xl bg-zinc-100/90", className)} />;
}

function InitialPlanGenerationState({
  canRetry,
  error,
  isGenerating,
  onRetry,
  studyId,
}: {
  canRetry: boolean;
  error: string | null;
  isGenerating: boolean;
  onRetry: () => void;
  studyId: string;
}) {
  const title = isGenerating
    ? "Generating your interview plan"
    : "No interview plan yet";
  const description = isGenerating
    ? "We're turning your study brief into a first draft. This usually takes 10-20 seconds."
    : "This study does not have a saved draft yet. Generate a first draft to continue.";
  const supportingCopy = isGenerating
    ? "Nothing to review yet. This page will update automatically when the draft is ready."
    : "No current plan will be replaced because there isn't one yet.";

  return (
    <div className="min-h-full bg-[linear-gradient(180deg,rgba(255,255,255,0.97),rgba(248,250,252,0.98))]">
      <div className="flex w-full flex-col gap-6 px-4 py-7 sm:px-6 lg:px-6 lg:py-9 xl:px-8 2xl:px-12">
        <section className="flex flex-col gap-5">
          <Link
            href={`/studies/${studyId}`}
            className="inline-flex w-fit items-center gap-2 text-sm font-medium text-zinc-600 transition-colors hover:text-zinc-950"
          >
            <ArrowLeft className="size-4" />
            Back to Study
          </Link>

          <div className="max-w-3xl space-y-3">
            <h1 className="font-heading text-[1.9rem] leading-none font-semibold tracking-tight text-zinc-950 sm:text-[2.2rem]">
              {title}
            </h1>
            <p className="text-[15px] leading-7 text-zinc-500">
              {description}
            </p>
            <p className="text-[14px] leading-7 text-zinc-500">
              {supportingCopy}
            </p>
          </div>
        </section>

        {error ? (
          <div className="max-w-3xl rounded-[24px] border border-rose-100 bg-white/96 p-6 shadow-[0_24px_64px_-40px_rgba(15,23,42,0.24)]">
            <p className="text-[14px] leading-7 text-rose-600">
              {error}
            </p>
            <p className="mt-2 text-[14px] leading-7 text-zinc-500">
              Your study was created, but no new draft was saved.
            </p>
            <Button
              type="button"
              size="lg"
              onClick={onRetry}
              disabled={!canRetry}
              className="mt-5 h-11 rounded-xl px-5 text-sm font-semibold"
            >
              <RefreshCcw className={cn("size-4", isGenerating && "animate-spin")} />
              {isGenerating ? "Generating..." : "Try Again"}
            </Button>
          </div>
        ) : null}

        <section className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(320px,0.95fr)]">
          <PlanColumn>
            <PlanSection title="Objective">
              <div className="space-y-3">
                <PlanSkeletonBlock className="h-5 w-[86%]" />
                <PlanSkeletonBlock className="h-5 w-[92%]" />
                <PlanSkeletonBlock className="h-5 w-[72%]" />
              </div>
            </PlanSection>
            <PlanSeparator />
            <PlanSection title="Key Hypotheses">
              <div className="space-y-4">
                <PlanSkeletonBlock className="h-6 w-[88%]" />
                <PlanSkeletonBlock className="h-6 w-[81%]" />
                <PlanSkeletonBlock className="h-6 w-[77%]" />
              </div>
            </PlanSection>
            <PlanSeparator />
            <PlanSection title="Core Topics">
              <div className="space-y-4">
                <PlanSkeletonBlock className="h-6 w-[70%]" />
                <PlanSkeletonBlock className="h-6 w-[64%]" />
                <PlanSkeletonBlock className="h-6 w-[68%]" />
              </div>
            </PlanSection>
          </PlanColumn>

          <PlanColumn>
            <PlanSection title="Opening Question">
              <div className="space-y-3">
                <PlanSkeletonBlock className="h-5 w-[90%]" />
                <PlanSkeletonBlock className="h-5 w-[82%]" />
              </div>
            </PlanSection>
            <PlanSeparator />
            <PlanSection title="Probing Strategy">
              <div className="space-y-4">
                <PlanSkeletonBlock className="h-6 w-[84%]" />
                <PlanSkeletonBlock className="h-6 w-[74%]" />
                <PlanSkeletonBlock className="h-6 w-[79%]" />
                <div className="rounded-[20px] border border-primary/12 bg-[linear-gradient(180deg,rgba(248,250,252,0.96),rgba(238,242,255,0.82))] px-5 py-4">
                  <PlanSkeletonBlock className="h-5 w-32 bg-white/90" />
                  <div className="mt-4 space-y-3">
                    <PlanSkeletonBlock className="h-5 w-[91%]" />
                    <PlanSkeletonBlock className="h-5 w-[87%]" />
                    <PlanSkeletonBlock className="h-5 w-[79%]" />
                  </div>
                </div>
              </div>
            </PlanSection>
          </PlanColumn>
        </section>
      </div>
    </div>
  );
}

export function InterviewPlanPage({
  initialStudyDetail,
  initialStudyPlanGenerationStatus,
  plan,
  studyId,
}: {
  initialStudyDetail: StudyDetailModel;
  initialStudyPlanGenerationStatus: StudyPlanGenerationResponse | null;
  plan: StudyPlanModel | null;
  studyId: string;
}) {
  const queryClient = useQueryClient();
  const router = useRouter();
  const studyDetailQuery = useQuery({
    queryKey: ["study-detail", studyId],
    queryFn: () => browserApiClient.studies.detail(studyId),
    initialData: initialStudyDetail,
    staleTime: SERVER_RENDERED_QUERY_STALE_TIME_MS,
  });
  const planQuery = useQuery({
    queryKey: ["study-plan", studyId],
    queryFn: async () => {
      try {
        return await browserApiClient.plans.get(studyId);
      } catch (error) {
        if (error instanceof ApiError && error.status === 404) {
          return null;
        }

        throw error;
      }
    },
    initialData: plan,
    refetchInterval: (query) => {
      const status = queryClient.getQueryData<StudyPlanGenerationResponse>([
        "study-plan-generation",
        studyId,
      ]);

      return status?.status === "pending" ? PLAN_GENERATION_POLL_MS : false;
    },
    staleTime: SERVER_RENDERED_QUERY_STALE_TIME_MS,
  });
  const planGenerationStatusQuery = useQuery({
    queryKey: ["study-plan-generation", studyId],
    queryFn: () => browserApiClient.plans.status(studyId),
    initialData: initialStudyPlanGenerationStatus ?? undefined,
    refetchInterval: (query) =>
      query.state.data?.status === "pending" ? PLAN_GENERATION_POLL_MS : false,
    staleTime: 0,
  });
  const [isEditTopicsOpen, setIsEditTopicsOpen] = useState(false);
  const [editTopicsSession, setEditTopicsSession] = useState(0);
  const [generationMode, setGenerationMode] = useState<"initial" | "regenerate" | null>(null);
  const editablePlan = planQuery.data ?? null;
  const planGenerationStatus = planGenerationStatusQuery.data ?? null;
  const generationPending = planGenerationStatus?.status === "pending";
  const generationError =
    planGenerationStatus?.status === "failed" ? planGenerationStatus.error ?? null : null;
  const previousPlanGenerationStatusRef = useRef(planGenerationStatus?.status ?? null);
  const updatePlanMutation = useMutation({
    mutationFn: (nextPlan: StudyPlanModel) =>
      browserApiClient.plans.update(studyId, {
        mustCoverAreas: nextPlan.mustCoverAreas,
        selectedBehaviorId: nextPlan.selectedBehaviorId,
        selectedTone: nextPlan.selectedTone,
        thingsToAvoid: nextPlan.thingsToAvoid,
        topics: nextPlan.topics,
      }),
    onSuccess: (nextPlan) => {
      queryClient.setQueryData(["study-plan", studyId], nextPlan);
    },
  });
  const initialPlanGenerationMutation = useMutation({
    mutationFn: () => browserApiClient.plans.generate(studyId),
    onSuccess: (nextState) => {
      queryClient.setQueryData(["study-plan-generation", studyId], nextState);
      void Promise.all([
        queryClient.invalidateQueries({ queryKey: ["study-plan", studyId] }),
        queryClient.invalidateQueries({
          queryKey: ["study-plan-generation", studyId],
        }),
      ]);
      setGenerationMode("initial");
    },
    onError: () => {
      setGenerationMode(null);
    },
  });
  const regeneratePlanMutation = useMutation({
    mutationFn: () => browserApiClient.plans.generate(studyId),
    onSuccess: (nextState) => {
      queryClient.setQueryData(["study-plan-generation", studyId], nextState);
      void Promise.all([
        queryClient.invalidateQueries({ queryKey: ["study-plan", studyId] }),
        queryClient.invalidateQueries({
          queryKey: ["study-plan-generation", studyId],
        }),
      ]);
    },
    onError: () => {
      setGenerationMode(null);
    },
  });
  const approvePlanMutation = useMutation({
    mutationFn: () => browserApiClient.plans.approve(studyId),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["studies"] }),
        queryClient.invalidateQueries({ queryKey: ["study-detail", studyId] }),
      ]);
    },
  });
  const launchInterviewMutation = useMutation({
    mutationFn: async ({ approveFirst }: { approveFirst: boolean }) => {
      if (approveFirst) {
        await browserApiClient.plans.approve(studyId);
      }

      return browserApiClient.invites.create(studyId);
    },
    onSuccess: async (invite) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["studies"] }),
        queryClient.invalidateQueries({ queryKey: ["study-detail", studyId] }),
      ]);
      try {
        await copyTextToClipboard(invite.inviteUrl);
        toast.success("Invite created and copied to clipboard.");
      } catch {
        toast.success("Invite created.");
        toast.message("Copy it from the interview sessions list.");
      }
      router.push(`/studies/${studyId}`);
    },
  });

  const hasApprovedPlan = studyDetailQuery.data?.hasApprovedPlan ?? false;
  const canApprovePlan = studyDetailQuery.data?.canApprovePlan ?? true;
  const canEditPlan = studyDetailQuery.data?.canEditPlan ?? true;
  const canRegeneratePlan = studyDetailQuery.data?.canRegeneratePlan ?? true;
  const canStartInterview = studyDetailQuery.data?.canStartInterview ?? false;
  const canApproveBeforeStart = !hasApprovedPlan && canApprovePlan;
  const canLaunchInterview = canStartInterview || canApproveBeforeStart;
  const studyEnded = studyDetailQuery.data?.status === "completed";
  const initialPlanGenerationPending =
    initialPlanGenerationMutation.isPending ||
    (generationPending && (!editablePlan || generationMode === "initial"));
  const regenerationPending =
    regeneratePlanMutation.isPending ||
    (generationPending && editablePlan !== null);
  const estimatedDurationLabel =
    editablePlan?.estimatedDurationLabel ??
    studyDetailQuery.data?.metadata.interviewDurationLabel ??
    "Estimate after plan generation";
  const actionButtonsDisabled =
    approvePlanMutation.isPending ||
    launchInterviewMutation.isPending ||
    regenerationPending ||
    generationPending;

  useEffect(() => {
    const currentStatus = planGenerationStatus?.status ?? null;
    const previousStatus = previousPlanGenerationStatusRef.current;

    if (
      previousStatus === "pending" &&
      currentStatus === "failed" &&
      editablePlan !== null
    ) {
      toast.error("The latest regenerate attempt failed. Your current plan was not changed.", {
        description: generationError ?? "We couldn't generate a new draft right now.",
      });
    }

    previousPlanGenerationStatusRef.current = currentStatus;
  }, [editablePlan, generationError, planGenerationStatus?.status]);

  if (planQuery.isError) {
    return (
      <div className="flex min-h-full items-center justify-center bg-[linear-gradient(180deg,rgba(255,255,255,0.97),rgba(248,250,252,0.98))] px-4 py-10">
        <div className="rounded-3xl border border-rose-100 bg-rose-50 px-6 py-8 text-center text-sm text-rose-700">
          We couldn&apos;t load the interview plan right now.
        </div>
      </div>
    );
  }

  if (!editablePlan) {
    return (
      <InitialPlanGenerationState
        canRetry={!initialPlanGenerationPending && canRegeneratePlan}
        error={generationError}
        isGenerating={initialPlanGenerationPending}
        onRetry={() => {
          setGenerationMode("initial");
          initialPlanGenerationMutation.mutate();
        }}
        studyId={studyId}
      />
    );
  }

  return (
    <>
      <div className="min-h-full bg-[linear-gradient(180deg,rgba(255,255,255,0.97),rgba(248,250,252,0.98))]">
        <div className="flex w-full flex-col gap-6 px-4 py-7 sm:px-6 lg:px-6 lg:py-9 xl:px-8 2xl:px-12">
          <section className="flex flex-col gap-5">
            <Link
              href={`/studies/${studyId}`}
              className="inline-flex w-fit items-center gap-2 text-sm font-medium text-zinc-600 transition-colors hover:text-zinc-950"
            >
              <ArrowLeft className="size-4" />
              Back to Study
            </Link>

            <div className="flex flex-col gap-5 md:flex-row md:items-start md:justify-between md:gap-8">
              <div className="min-w-0 flex-1 space-y-2">
                <h1 className="font-heading text-[1.9rem] leading-none font-semibold tracking-tight text-zinc-950 sm:text-[2.2rem]">
                  Interview Plan
                </h1>
                <p className="text-[15px] leading-7 text-zinc-500">
                  {editablePlan.subtitle}
                </p>
                <div className="inline-flex items-center gap-2 rounded-full border border-zinc-200/80 bg-white px-3 py-1.5 text-[12px] font-medium text-zinc-600">
                  <Clock3 className="size-3.5 text-zinc-400" />
                  <span>Estimated interview time</span>
                  <span className="text-zinc-900">{estimatedDurationLabel}</span>
                </div>
              </div>

              <div className="flex shrink-0 items-center gap-3">
                <Button
                  type="button"
                  variant="outline"
                  size="lg"
                  disabled={
                    !canRegeneratePlan ||
                    regenerationPending ||
                    actionButtonsDisabled
                  }
                  onClick={() => {
                    setGenerationMode("regenerate");
                    regeneratePlanMutation.mutate(undefined, {
                      onError: () => {
                        toast.error(
                          "We couldn't generate a new draft right now. Your current plan was not changed.",
                        );
                      },
                    });
                  }}
                  className="rounded-xl border-zinc-200 bg-white px-4 text-sm font-medium text-zinc-800 shadow-none hover:bg-zinc-50"
                >
                  <RefreshCcw
                    className={cn("size-4", regenerationPending && "animate-spin")}
                  />
                  {regenerationPending ? "Regenerating..." : "Regenerate Plan"}
                </Button>
              </div>
            </div>
          </section>

          <section className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(320px,0.95fr)]">
            <PlanColumn>
              <PlanSection title="Objective">
                <p className="text-[15px] leading-8 text-zinc-700">
                  {editablePlan.objective}
                </p>
              </PlanSection>
              <PlanSeparator />
              <PlanSection title="Key Hypotheses">
                <NumberedList items={editablePlan.hypotheses} bulletTone="soft" />
              </PlanSection>
              <PlanSeparator />
              <PlanSection title="Core Topics">
                <NumberedList items={editablePlan.topics} bulletTone="soft" />
              </PlanSection>
            </PlanColumn>

            <PlanColumn>
              <PlanSection title="Opening Question">
                <p className="text-[15px] leading-8 text-zinc-700">
                  {editablePlan.openingQuestion}
                </p>
              </PlanSection>
              <PlanSeparator />
              <PlanSection title="Probing Strategy">
                <div className="space-y-5">
                  <BulletList
                    items={editablePlan.probingStrategy}
                    markerClassName="bg-primary/60"
                  />
                  <ExampleProbeCallout items={editablePlan.exampleProbes} />
                </div>
              </PlanSection>
              <PlanSeparator />
              <section className="px-6 py-5 sm:px-7 sm:py-6">
                {regenerationPending && generationMode === "regenerate" ? (
                  <div className="mb-3 rounded-xl border border-sky-100 bg-sky-50 px-4 py-3 text-[13px] text-sky-700">
                    <p className="font-medium text-sky-900">Generating a new draft from your study brief.</p>
                    <p className="mt-1 text-sky-700">
                      Your current plan stays visible until the new draft is ready. This usually takes 10-20 seconds.
                    </p>
                  </div>
                ) : null}
                {generationError && !regenerationPending ? (
                  <div className="mb-3 rounded-xl border border-rose-100 bg-rose-50 px-4 py-3 text-[13px] text-rose-700">
                    <p className="font-medium text-rose-900">
                      The latest regenerate attempt failed. Your current plan was not changed.
                    </p>
                    <p className="mt-1 text-rose-700">{generationError}</p>
                  </div>
                ) : null}
                {studyEnded ? (
                  <p className="mb-3 rounded-xl border border-amber-100 bg-amber-50 px-4 py-3 text-[13px] text-amber-700">
                    This study has been ended. The approved plan remains visible, but plan edits
                    and new interview launches are disabled.
                  </p>
                ) : null}
                {hasApprovedPlan ? (
                  <p className="mb-3 rounded-xl border border-zinc-200/80 bg-zinc-50 px-4 py-3 text-[13px] text-zinc-600">
                    New interviews use the latest approved plan. Approve the current plan first if
                    you want these edits applied before launching another session.
                  </p>
                ) : null}
                <div className="flex flex-col gap-3 sm:flex-row">
                  <Button
                    type="button"
                    variant="outline"
                    size="lg"
                    disabled={!canEditPlan || actionButtonsDisabled}
                    onClick={() => {
                      setEditTopicsSession((current) => current + 1);
                      setIsEditTopicsOpen(true);
                    }}
                    className="h-12 w-full rounded-xl border-zinc-200 bg-white px-6 text-sm font-medium text-zinc-800 shadow-none hover:bg-zinc-50 sm:flex-[0.95]"
                  >
                    <PenLine className="size-4" />
                    Edit Topics
                  </Button>
                  {hasApprovedPlan ? (
                    <Button
                      type="button"
                      variant="outline"
                      size="lg"
                      disabled={!canApprovePlan || actionButtonsDisabled}
                      onClick={() => {
                        approvePlanMutation.mutate(undefined, {
                          onError: () => {
                            toast.error("We could not approve the current plan.");
                          },
                        });
                      }}
                      className="h-12 w-full rounded-xl border-zinc-200 bg-white px-6 text-sm font-medium text-zinc-800 shadow-none hover:bg-zinc-50 sm:flex-[1.1]"
                    >
                      {approvePlanMutation.isPending ? "Approving..." : "Approve Current Plan"}
                    </Button>
                  ) : null}
                  <Button
                    type="button"
                    size="lg"
                    disabled={!canLaunchInterview || actionButtonsDisabled}
                    onClick={() => {
                      launchInterviewMutation.mutate(
                        { approveFirst: canApproveBeforeStart },
                        {
                          onError: (error) => {
                            if (error instanceof ApiError && error.status === 409) {
                              toast.error(error.message);
                              return;
                            }

                            toast.error(
                              canStartInterview
                                ? "We could not create the participant invite."
                                : "We could not approve the plan and create the participant invite.",
                            );
                          },
                        },
                      );
                    }}
                    className="h-12 w-full rounded-xl px-6 text-sm font-semibold shadow-[0_24px_48px_-24px_rgba(29,78,216,0.5)] hover:bg-primary/90 sm:flex-[1.55]"
                  >
                    {launchInterviewMutation.isPending
                      ? "Creating invite..."
                      : canApproveBeforeStart
                        ? "Approve & Create Invite"
                        : "Create Invite"}
                  </Button>
                </div>
              </section>
            </PlanColumn>
          </section>
        </div>
      </div>

      <EditTopicsDialog
        key={editTopicsSession}
        open={isEditTopicsOpen}
        plan={editablePlan}
        onOpenChange={setIsEditTopicsOpen}
        onSave={async (nextPlan) => {
          const mergedPlan = { ...editablePlan, ...nextPlan };

          try {
            await updatePlanMutation.mutateAsync(mergedPlan);
          } catch {
            const message = "We could not save those plan changes.";
            toast.error(message);
            throw new Error(message);
          }
        }}
      />
    </>
  );
}
