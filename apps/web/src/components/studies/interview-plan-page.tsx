"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Ellipsis, PenLine, RefreshCcw, Sparkles } from "lucide-react";

import { EditTopicsDialog } from "@/components/studies/edit-topics-dialog";
import type { StudyPlanModel } from "@/components/studies/study-plans.mock";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { browserApiClient } from "@/lib/api/client";
import { cn } from "@/lib/utils";

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

export function InterviewPlanPage({
  plan,
  studyId,
}: {
  plan: StudyPlanModel;
  studyId: string;
}) {
  const queryClient = useQueryClient();
  const router = useRouter();
  const planQuery = useQuery({
    queryKey: ["study-plan", studyId],
    queryFn: () => browserApiClient.plans.get(studyId),
    initialData: plan,
  });
  const [editablePlan, setEditablePlan] = useState(planQuery.data);
  const [isEditTopicsOpen, setIsEditTopicsOpen] = useState(false);
  const [editTopicsSession, setEditTopicsSession] = useState(0);
  const [error, setError] = useState<string | null>(null);
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
      setEditablePlan(nextPlan);
    },
  });
  const regeneratePlanMutation = useMutation({
    mutationFn: () => browserApiClient.plans.generate(studyId),
    onSuccess: (nextPlan) => {
      queryClient.setQueryData(["study-plan", studyId], nextPlan);
      setEditablePlan(nextPlan);
      setError(null);
    },
  });
  const startInterviewMutation = useMutation({
    mutationFn: async () => {
      await browserApiClient.plans.approve(studyId);
      return browserApiClient.invites.create(studyId);
    },
    onSuccess: async (invite) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["studies"] }),
        queryClient.invalidateQueries({ queryKey: ["study-detail", studyId] }),
      ]);
      router.push(`/interviews/${invite.inviteCode}/welcome`);
    },
  });

  useEffect(() => {
    setEditablePlan(planQuery.data);
  }, [planQuery.data]);

  if (planQuery.isError) {
    return (
      <div className="flex min-h-full items-center justify-center bg-[linear-gradient(180deg,rgba(255,255,255,0.97),rgba(248,250,252,0.98))] px-4 py-10">
        <div className="rounded-3xl border border-rose-100 bg-rose-50 px-6 py-8 text-center text-sm text-rose-700">
          We couldn't load the interview plan right now.
        </div>
      </div>
    );
  }

  if (!editablePlan) {
    return (
      <div className="flex min-h-full items-center justify-center bg-[linear-gradient(180deg,rgba(255,255,255,0.97),rgba(248,250,252,0.98))] px-4 py-10 text-sm text-zinc-500">
        Loading interview plan...
      </div>
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
              </div>

              <div className="flex shrink-0 items-center gap-3">
                <Button
                  type="button"
                  variant="outline"
                  size="lg"
                  disabled={regeneratePlanMutation.isPending}
                  onClick={() => {
                    setError(null);
                    regeneratePlanMutation.mutate(undefined, {
                      onError: () => {
                        setError("We could not regenerate the plan right now.");
                      },
                    });
                  }}
                  className="rounded-xl border-zinc-200 bg-white px-4 text-sm font-medium text-zinc-800 shadow-none hover:bg-zinc-50"
                >
                  <RefreshCcw className="size-4" />
                  {regeneratePlanMutation.isPending ? "Regenerating..." : "Regenerate Plan"}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="icon-lg"
                  className="rounded-xl border-zinc-200 bg-white text-zinc-700 shadow-none hover:bg-zinc-50"
                  aria-label="More actions"
                >
                  <Ellipsis className="size-5" />
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
                {error ? (
                  <p className="mb-3 rounded-xl border border-rose-100 bg-rose-50 px-4 py-3 text-[13px] text-rose-600">
                    {error}
                  </p>
                ) : null}
                <div className="flex flex-col gap-3 sm:flex-row">
                  <Button
                    type="button"
                    variant="outline"
                    size="lg"
                    onClick={() => {
                      setEditTopicsSession((current) => current + 1);
                      setIsEditTopicsOpen(true);
                    }}
                    className="h-12 w-full rounded-xl border-zinc-200 bg-white px-6 text-sm font-medium text-zinc-800 shadow-none hover:bg-zinc-50 sm:flex-[0.95]"
                  >
                    <PenLine className="size-4" />
                    Edit Topics
                  </Button>
                  <Button
                    type="button"
                    size="lg"
                    disabled={startInterviewMutation.isPending}
                    onClick={() => {
                      setError(null);
                      startInterviewMutation.mutate(undefined, {
                        onError: () => {
                          setError("We could not approve the plan and start the interview.");
                        },
                      });
                    }}
                    className="h-12 w-full rounded-xl px-6 text-sm font-semibold shadow-[0_24px_48px_-24px_rgba(29,78,216,0.5)] hover:bg-primary/90 sm:flex-[1.55]"
                  >
                    {startInterviewMutation.isPending
                      ? "Starting interview..."
                      : "Approve & Start Interview"}
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
          setError(null);

          try {
            await updatePlanMutation.mutateAsync(mergedPlan);
          } catch {
            const message = "We could not save those plan changes.";
            setError(message);
            throw new Error(message);
          }
        }}
      />
    </>
  );
}
