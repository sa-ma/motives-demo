"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  CalendarDays,
  CircleAlert,
  CircleCheck,
  Clock3,
  Ellipsis,
  ExternalLink,
  Flag,
  MessageSquareMore,
  Plus,
  Sparkles,
  Target,
  TriangleAlert,
  UserRound,
  UsersRound,
} from "lucide-react";

import type {
  StudyActivityItem,
  StudyDetail as StudyDetailModel,
  StudyMetricCard,
  StudySessionItem,
  StudyTopicCoverageItem,
} from "@motives-ai/contracts";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { browserApiClient } from "@/lib/api/client";
import { cn } from "@/lib/utils";

const metricToneClasses: Record<StudyMetricCard["tone"], string> = {
  primary: "bg-primary/8 text-primary",
  success: "bg-emerald-50 text-emerald-700",
  warning: "bg-amber-50 text-amber-700",
  violet: "bg-violet-50 text-violet-700",
};

const metricIcons: Record<
  StudyMetricCard["tone"],
  React.ComponentType<{ className?: string }>
> = {
  primary: MessageSquareMore,
  success: MessageSquareMore,
  warning: MessageSquareMore,
  violet: Flag,
};

const metricProgressClasses: Record<StudyMetricCard["tone"], string> = {
  primary: "bg-[linear-gradient(90deg,#8b5cf6,#4f46e5)]",
  success: "bg-[linear-gradient(90deg,#22c55e,#16a34a)]",
  warning: "bg-[linear-gradient(90deg,#f59e0b,#f97316)]",
  violet: "bg-[linear-gradient(90deg,#a78bfa,#8b5cf6)]",
};

const studyStatusBadgeClasses: Record<
  StudyDetailModel["status"],
  string
> = {
  interviewing: "border-blue-100 bg-blue-50 text-blue-700",
  planning: "border-sky-100 bg-sky-50 text-sky-700",
  analyzing: "border-violet-100 bg-violet-50 text-violet-700",
  completed: "border-emerald-100 bg-emerald-50 text-emerald-700",
  archived: "border-zinc-200 bg-zinc-100 text-zinc-700",
};

const topicStatusConfig: Record<
  StudyTopicCoverageItem["status"],
  { label: string; className: string; barClassName: string }
> = {
  covered: {
    label: "Covered",
    className: "border-emerald-100 bg-emerald-50 text-emerald-700",
    barClassName: "bg-emerald-500",
  },
  "in-progress": {
    label: "In Progress",
    className: "border-amber-100 bg-amber-50 text-amber-700",
    barClassName: "bg-amber-500",
  },
  "weak-evidence": {
    label: "Weak evidence",
    className: "border-orange-100 bg-orange-50 text-orange-700",
    barClassName: "bg-orange-400",
  },
  "not-explored": {
    label: "Not explored",
    className: "border-zinc-200 bg-zinc-50 text-zinc-500",
    barClassName: "bg-zinc-300",
  },
  "pending-analysis": {
    label: "Pending analysis",
    className: "border-sky-100 bg-sky-50 text-sky-700",
    barClassName: "bg-sky-300",
  },
};

const emotionalSignalConfig: Record<
  StudySessionItem["emotionalSignal"],
  { label: string; className: string; dotClassName: string; activeDots: number }
> = {
  high: {
    label: "High",
    className: "text-rose-600",
    dotClassName: "bg-rose-500",
    activeDots: 3,
  },
  medium: {
    label: "Medium",
    className: "text-amber-600",
    dotClassName: "bg-amber-400",
    activeDots: 2,
  },
  low: {
    label: "Low",
    className: "text-zinc-500",
    dotClassName: "bg-zinc-400",
    activeDots: 1,
  },
};

const activityIconConfig: Record<
  StudyActivityItem["type"],
  { icon: React.ComponentType<{ className?: string }>; className: string }
> = {
  "session-complete": {
    icon: CircleCheck,
    className: "bg-emerald-50 text-emerald-600",
  },
  signal: {
    icon: Sparkles,
    className: "bg-violet-50 text-violet-600",
  },
  contradiction: {
    icon: TriangleAlert,
    className: "bg-amber-50 text-amber-600",
  },
  coverage: {
    icon: Target,
    className: "bg-emerald-50 text-emerald-600",
  },
  "session-start": {
    icon: UserRound,
    className: "bg-sky-50 text-sky-600",
  },
};

function PageCard({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <Card
      className={cn(
        "rounded-[18px] border-zinc-200/80 bg-white/96 shadow-[0_24px_64px_-40px_rgba(15,23,42,0.24)]",
        className,
      )}
    >
      <CardContent className="p-0">{children}</CardContent>
    </Card>
  );
}

function SectionHeader({
  title,
  action,
  className,
}: {
  title: string;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex items-center justify-between gap-4 px-6 py-5 sm:px-7", className)}>
      <h2 className="text-[1.1rem] leading-7 font-semibold tracking-tight text-zinc-950">
        {title}
      </h2>
      {action}
    </div>
  );
}

function DetailMetadata({
  icon: Icon,
  label,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
}) {
  return (
    <div className="inline-flex items-center gap-2 text-[13px] text-zinc-500">
      <Icon className="size-4 text-zinc-400" />
      <span>{label}</span>
    </div>
  );
}

function MetricCard({ metric }: { metric: StudyMetricCard }) {
  const Icon = metricIcons[metric.tone];

  return (
    <PageCard className="overflow-hidden rounded-[16px]">
      <div className="p-5">
        <div className="flex items-center gap-3">
          <div
            className={cn(
              "inline-flex size-9 shrink-0 items-center justify-center rounded-xl",
              metricToneClasses[metric.tone],
            )}
          >
            <Icon className="size-3.5" />
          </div>
          <p className="text-[13px] font-medium text-zinc-900">{metric.label}</p>
        </div>

        <div className="mt-5 space-y-1">
          <p className="text-[1.55rem] leading-none font-semibold tracking-tight text-zinc-950">
            {metric.value}
          </p>
          <p className="text-[13px] text-zinc-500">{metric.subtitle}</p>
        </div>

        {metric.progress !== undefined ? (
          <div className="mt-5 flex items-center gap-3">
            <div className="h-2 min-w-0 flex-1 overflow-hidden rounded-full bg-zinc-100">
              <div
                className={cn(
                  "h-full rounded-full",
                  metricProgressClasses[metric.tone],
                )}
                style={{ width: `${metric.progress}%` }}
              />
            </div>
            {metric.progressLabel ? (
              <span className="shrink-0 text-[12px] font-semibold text-zinc-700">
                {metric.progressLabel}
              </span>
            ) : null}
          </div>
        ) : null}

        {metric.trendLabel ? (
          <p className="mt-3 text-[12px] font-medium text-primary">
            ↑ {metric.trendLabel}
          </p>
        ) : null}
      </div>
    </PageCard>
  );
}

function EvidenceBars({ value, tone }: { value: number; tone: string }) {
  return (
    <div className="flex items-center gap-1.5">
      {Array.from({ length: 5 }).map((_, index) => (
        <span
          key={index}
          className={cn(
            "h-1.5 w-6 rounded-full sm:w-7",
            index < value ? tone : "bg-zinc-200",
          )}
        />
      ))}
    </div>
  );
}

function SessionSignal({ signal }: { signal: StudySessionItem["emotionalSignal"] }) {
  const config = emotionalSignalConfig[signal];

  return (
    <div className="grid min-w-0 content-start gap-1">
      <p className="text-[10px] leading-4 font-medium text-zinc-500">
        Emotional Signal
      </p>
      <div className="flex min-h-6 items-center gap-1.5">
        <span className={cn("text-[12px] font-semibold", config.className)}>
          {config.label}
        </span>
        <div className="flex items-center gap-1">
          {Array.from({ length: 4 }).map((_, index) => (
            <span
              key={index}
              className={cn(
                "size-1.5 rounded-full",
                index < config.activeDots ? config.dotClassName : "bg-zinc-200",
              )}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

function SessionActionButton({
  studyId,
  session,
}: {
  studyId: string;
  session: StudySessionItem;
}) {
  const className = cn(
    "h-8 rounded-lg px-3 text-[12px] shadow-none whitespace-nowrap",
    "border-zinc-200 bg-white text-zinc-800 hover:bg-zinc-50",
  );

  if (session.state === "completed" && session.debriefStatus === "ready") {
    return (
      <Link
        href={`/studies/${studyId}/interviews/${session.id}/debrief`}
        className={buttonVariants({
          variant: "outline",
          size: "sm",
          className,
        })}
      >
        {session.actionLabel}
      </Link>
    );
  }

  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      disabled
      className={className}
    >
      {session.actionLabel}
    </Button>
  );
}

export function StudyDetailPage({ study: initialStudy }: { study: StudyDetailModel }) {
  const queryClient = useQueryClient();
  const router = useRouter();
  const studyQuery = useQuery({
    queryKey: ["study-detail", initialStudy.studyId],
    queryFn: () => browserApiClient.studies.detail(initialStudy.studyId),
    initialData: initialStudy,
  });
  const startInterviewMutation = useMutation({
    mutationFn: () => browserApiClient.invites.create(initialStudy.studyId),
    onSuccess: async (invite) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["studies"] }),
        queryClient.invalidateQueries({ queryKey: ["study-detail", initialStudy.studyId] }),
      ]);
      router.push(`/interviews/${invite.inviteCode}`);
    },
  });
  const endStudyMutation = useMutation({
    mutationFn: () => browserApiClient.studies.end(initialStudy.studyId),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["studies"] }),
        queryClient.invalidateQueries({ queryKey: ["study-detail", initialStudy.studyId] }),
      ]);
      setError(null);
    },
  });
  const [error, setError] = useState<string | null>(null);
  const study = studyQuery.data ?? initialStudy;

  return (
    <div className="min-h-full bg-[linear-gradient(180deg,rgba(255,255,255,0.96),rgba(250,250,253,0.98))]">
      <div className="flex h-full w-full flex-col gap-6 px-4 py-7 sm:px-6 lg:px-6 lg:py-9 xl:px-8 2xl:px-12">
        <section className="flex flex-col gap-5">
          <Link
            href="/studies"
            className="inline-flex w-fit items-center gap-2 text-sm font-medium text-zinc-600 transition-colors hover:text-zinc-950"
          >
            <ArrowLeft className="size-4" />
            Back to Studies
          </Link>

          <div className="flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between xl:gap-8">
            <div className="min-w-0 flex-1 space-y-4">
              <div className="flex flex-wrap items-center gap-2.5">
                <h1 className="font-heading text-[1.55rem] leading-tight font-semibold tracking-tight text-zinc-950 md:text-[1.8rem]">
                  {study.title}
                </h1>
                <Badge
                  className={cn(
                    "shrink-0 rounded-full border px-3 py-1 text-[12px] font-semibold",
                    studyStatusBadgeClasses[study.status],
                  )}
                >
                  {study.statusLabel}
                </Badge>
              </div>

              <p className="text-[15px] leading-7 text-zinc-500 xl:max-w-[60ch] 2xl:max-w-[64ch]">
                {study.description}
              </p>

              <div className="flex flex-wrap items-center gap-x-5 gap-y-3">
                <DetailMetadata icon={CalendarDays} label={study.metadata.createdLabel} />
                <DetailMetadata
                  icon={Clock3}
                  label={study.metadata.interviewDurationLabel}
                />
                <DetailMetadata icon={UsersRound} label={study.metadata.audienceLabel} />
                <DetailMetadata
                  icon={UserRound}
                  label={study.metadata.interviewCountLabel}
                />
              </div>
            </div>

            <div className="flex shrink-0 flex-wrap items-center gap-3 xl:max-w-[27rem] xl:justify-end">
              <Link
                href={`/studies/${study.studyId}/plan`}
                className={buttonVariants({
                  variant: "outline",
                  size: "lg",
                  className:
                    "rounded-xl border-zinc-200 bg-white px-4 text-sm font-medium text-zinc-800 shadow-none hover:bg-zinc-50",
                })}
              >
                <ExternalLink className="size-4" />
                View Plan
              </Link>
              <Button
                type="button"
                size="lg"
                disabled={!study.canStartInterview || startInterviewMutation.isPending}
                onClick={() => {
                  setError(null);
                  startInterviewMutation.mutate(undefined, {
                    onError: () => {
                      setError("Approve the plan before creating an interview invite.");
                    },
                  });
                }}
                className="rounded-xl px-5 text-sm font-semibold shadow-[0_24px_48px_-24px_rgba(29,78,216,0.5)]"
              >
                {startInterviewMutation.isPending ? "Starting..." : "Start Interview"}
                <Plus className="size-4" />
              </Button>
              {study.canEndStudy ? (
                <Button
                  type="button"
                  variant="outline"
                  size="lg"
                  disabled={endStudyMutation.isPending}
                  onClick={() => {
                    setError(null);
                    endStudyMutation.mutate(undefined, {
                      onError: () => {
                        setError("We could not end the study right now.");
                      },
                    });
                  }}
                  className="rounded-xl border-amber-200 bg-white px-4 text-sm font-medium text-amber-700 shadow-none hover:bg-amber-50"
                >
                  {endStudyMutation.isPending ? "Ending..." : "End Study"}
                </Button>
              ) : null}
            </div>
          </div>

          {error ? (
            <p className="rounded-xl border border-rose-100 bg-rose-50 px-4 py-3 text-[13px] text-rose-600">
              {error}
            </p>
          ) : null}
        </section>

        <section className="grid gap-5 md:grid-cols-2 xl:grid-cols-4">
          {study.metrics.map((metric) => (
            <MetricCard key={metric.id} metric={metric} />
          ))}
        </section>

        <section className="grid items-start gap-5 xl:grid-cols-[minmax(0,1.1fr)_minmax(320px,0.9fr)] 2xl:grid-cols-[minmax(0,1.24fr)_minmax(440px,0.76fr)]">
          <div className="space-y-5">
            <PageCard>
              <SectionHeader title="Emerging Insights" />

              <div className="grid gap-4 px-6 pb-6 sm:px-7 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
                <div className="rounded-[16px] border border-zinc-200/80 bg-white p-5">
                  <p className="text-[13px] font-semibold text-zinc-950">Emerging Themes</p>
                  {study.insightThemes.length > 0 ? (
                    <div className="mt-4 flex flex-wrap gap-2.5">
                      {study.insightThemes.map((theme) => (
                        <Badge
                          key={theme}
                          className="rounded-xl border-primary/10 bg-primary/8 px-3 py-2 text-[11px] font-medium text-primary"
                        >
                          {theme}
                        </Badge>
                      ))}
                    </div>
                  ) : (
                    <p className="mt-4 text-[12px] leading-6 text-zinc-500">
                      {study.analysis.status === "pending"
                        ? "Theme synthesis will appear after the queued debriefs finish running."
                        : study.analysis.status === "partial"
                          ? "More themes will emerge as the remaining debriefs finish processing."
                          : study.analysis.status === "failed"
                            ? "Theme synthesis is unavailable until debrief analysis is retried."
                            : "Themes will appear once completed interviews have been analyzed."}
                    </p>
                  )}
                </div>

                <div className="rounded-[16px] border border-primary/12 bg-[linear-gradient(180deg,rgba(248,250,252,0.96),rgba(238,242,255,0.82))] p-5">
                  <div className="flex items-center gap-2.5">
                    <div className="flex size-8 items-center justify-center rounded-full bg-white text-primary shadow-[0_10px_24px_-16px_rgba(29,78,216,0.55)]">
                      <Sparkles className="size-4" />
                    </div>
                    <p className="text-[13px] font-semibold text-primary">AI Observation</p>
                  </div>
                  <p className="mt-4 text-[12px] leading-6 text-zinc-700">
                    {study.aiObservation}
                  </p>
                </div>
              </div>
            </PageCard>

            <PageCard>
              <div className="border-b border-zinc-200/80 px-4 py-4 sm:px-5">
                <h2 className="text-[0.95rem] leading-6 font-semibold tracking-tight text-zinc-950">
                  Interview Sessions
                </h2>
              </div>

              <div className="lg:hidden divide-y divide-zinc-200/80">
                {study.sessions.map((session) => {
                  return (
                    <div key={session.id} className="px-4 py-3.5 transition-colors sm:px-5">
                      <div className="space-y-3">
                        <div className="grid content-start gap-1">
                          <p className="text-[12px] leading-4 font-semibold text-zinc-950">
                            {session.participantLabel}
                          </p>
                          <p className="text-[11px] leading-5 text-zinc-500">
                            {session.stateLabel} · {session.timingLabel}
                          </p>
                        </div>

                        <div className="grid grid-cols-3 gap-x-3">
                          <SessionSignal signal={session.emotionalSignal} />

                          <div className="grid content-start gap-1">
                            <p className="text-[10px] leading-4 font-medium text-zinc-500">
                              Topics Covered
                            </p>
                            <div className="flex items-center gap-2">
                              <span className="text-[12px] font-semibold text-zinc-900">
                                {session.topicsCoveredLabel}
                              </span>
                              <div className="h-1.5 min-w-0 flex-1 overflow-hidden rounded-full bg-zinc-100">
                                <div
                                  className="h-full rounded-full bg-[linear-gradient(90deg,#8b5cf6,#4f46e5)]"
                                  style={{ width: `${session.topicsCoveredProgress}%` }}
                                />
                              </div>
                            </div>
                          </div>

                          <div className="grid content-start gap-1">
                            <p className="text-[10px] leading-4 font-medium text-zinc-500">
                              Contradictions
                            </p>
                            <p className="text-[12px] leading-5 font-semibold text-zinc-900">
                              {session.contradictionsCount}
                            </p>
                          </div>
                        </div>

                        <div className="flex items-center gap-2">
                          <SessionActionButton
                            studyId={study.studyId}
                            session={session}
                          />
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>

              <div className="hidden lg:block overflow-x-auto">
                <table className="w-full border-collapse">
                  <tbody>
                    {study.sessions.map((session) => {
                      return (
                        <tr key={session.id} className="border-t border-zinc-200/80 align-top">
                          <td className="px-3 py-3.5 sm:px-4">
                            <div className="grid content-start gap-1">
                              <p className="text-[12px] leading-4 font-semibold text-zinc-950">
                                {session.participantLabel}
                              </p>
                              <p className="whitespace-nowrap text-[11px] leading-6 text-zinc-500">
                                {session.stateLabel} · {session.timingLabel}
                              </p>
                            </div>
                          </td>
                          <td className="px-2 py-3.5">
                            <SessionSignal signal={session.emotionalSignal} />
                          </td>
                          <td className="px-2 py-3.5">
                            <div className="grid content-start gap-1">
                              <p className="text-[10px] leading-4 font-medium text-zinc-500">
                                Topics Covered
                              </p>
                              <div className="flex min-h-6 items-center gap-2">
                                <span className="text-[12px] font-semibold text-zinc-900">
                                  {session.topicsCoveredLabel}
                                </span>
                                <div className="h-1.5 min-w-0 flex-1 overflow-hidden rounded-full bg-zinc-100">
                                  <div
                                    className="h-full rounded-full bg-[linear-gradient(90deg,#8b5cf6,#4f46e5)]"
                                    style={{ width: `${session.topicsCoveredProgress}%` }}
                                  />
                                </div>
                              </div>
                            </div>
                          </td>
                          <td className="px-2 py-3.5">
                            <div className="grid content-start gap-1">
                              <p className="text-[10px] leading-4 font-medium text-zinc-500">
                                Contradictions
                              </p>
                              <p className="min-h-6 text-[12px] leading-6 font-semibold text-zinc-900">
                                {session.contradictionsCount}
                              </p>
                            </div>
                          </td>
                          <td className="px-3 py-3.5 sm:px-4">
                            <SessionActionButton
                              studyId={study.studyId}
                              session={session}
                            />
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </PageCard>
          </div>

          <div className="space-y-5">
            <PageCard>
              <SectionHeader
                title="Topic Coverage"
                action={<CircleAlert className="size-4 text-zinc-400" />}
                className="px-5 pb-2.5 pt-4 sm:px-6"
              />

              <div className="px-5 pb-3 sm:px-6">
                <div className="grid grid-cols-[minmax(0,1.6fr)_132px_minmax(120px,0.9fr)] gap-3 border-b border-zinc-200/80 pb-1.5 text-[11px] font-medium uppercase tracking-[0.08em] text-zinc-400">
                  <span>Topic</span>
                  <span className="text-center">Status</span>
                  <span>Evidence</span>
                </div>

                {study.analysis.status === "pending" ? (
                  <p className="pt-3 text-[12px] leading-5 text-zinc-500">
                    Topic coverage will populate after the queued debriefs finish analyzing the completed interviews.
                  </p>
                ) : null}

                <div className="divide-y divide-zinc-200/80">
                  {study.topicCoverage.map((item) => {
                    const config = topicStatusConfig[item.status];

                    return (
                      <div
                        key={item.id}
                        className="grid grid-cols-[minmax(0,1.6fr)_132px_minmax(120px,0.9fr)] items-center gap-3 py-2"
                      >
                        <p className="pr-1 text-[13px] leading-5 text-zinc-700">{item.topic}</p>
                        <Badge
                          variant="outline"
                          className={cn(
                            "justify-self-center rounded-full px-2.5 py-1 text-[10px] font-semibold",
                            config.className,
                          )}
                        >
                          {config.label}
                        </Badge>
                        <div className="min-w-0">
                          <EvidenceBars value={item.evidence} tone={config.barClassName} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </PageCard>

            <PageCard>
              <SectionHeader title="Recent Activity" className="px-5 pb-2.5 pt-4 sm:px-6" />

              <div className="px-5 pb-2 sm:px-6">
                {study.recentActivity.map((activity) => {
                  const config = activityIconConfig[activity.type];
                  const Icon = config.icon;

                  return (
                    <div
                      key={activity.id}
                      className="flex items-start gap-2.5 py-1.5"
                    >
                      <div
                        className={cn(
                          "mt-0.5 inline-flex size-5.5 shrink-0 items-center justify-center rounded-full",
                          config.className,
                        )}
                      >
                        <Icon className="size-[11px]" />
                      </div>
                      <div
                        className={cn(
                          "flex min-w-0 flex-1 items-start justify-between gap-3",
                          activity.id !== study.recentActivity[study.recentActivity.length - 1]?.id &&
                            "border-b border-zinc-200/80 pb-1.5",
                        )}
                      >
                        <div className="min-w-0">
                          <p className="text-[12px] leading-4.5 text-zinc-800">{activity.title}</p>
                          {activity.detail ? (
                            <p className="mt-0.5 text-[12px] leading-4.5 text-zinc-500">
                              {activity.detail}
                            </p>
                          ) : null}
                        </div>
                        <p className="shrink-0 pt-0.5 text-[11px] text-zinc-400">
                          {activity.timestamp}
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </PageCard>
          </div>
        </section>
      </div>
    </div>
  );
}
