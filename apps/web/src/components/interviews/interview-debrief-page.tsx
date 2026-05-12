import Link from "next/link";
import {
  ArrowLeft,
  Ellipsis,
  FileDown,
  Lightbulb,
  Quote,
  ShieldQuestion,
  Sparkles,
  Target,
} from "lucide-react";

import type {
  SessionDebrief as InterviewDebriefModel,
  SessionDebriefEvidenceItem as InterviewDebriefEvidenceItem,
  SessionDebriefReasoningRow as InterviewDebriefReasoningRow,
} from "@motives-ai/contracts";
import { InterviewDebriefTranscriptPanel } from "@/components/interviews/interview-debrief-transcript-panel";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export type DebriefTab =
  | "summary"
  | "transcript"
  | "coverage"
  | "ai-reasoning";

const tabs: Array<{ id: DebriefTab; label: string }> = [
  { id: "summary", label: "Summary" },
  { id: "transcript", label: "Transcript" },
  { id: "coverage", label: "Coverage" },
  { id: "ai-reasoning", label: "AI Reasoning" },
];

const themeStrengthClassNames = {
  high: {
    label: "High",
    text: "text-zinc-700",
    fill: "bg-[linear-gradient(90deg,#8b5cf6,#4f46e5)]",
  },
  medium: {
    label: "Medium",
    text: "text-zinc-700",
    fill: "bg-[linear-gradient(90deg,#818cf8,#6366f1)]",
  },
  low: {
    label: "Low",
    text: "text-zinc-500",
    fill: "bg-[linear-gradient(90deg,#c4b5fd,#a5b4fc)]",
  },
} as const;

const themeStrengthBars = {
  high: 4,
  medium: 3,
  low: 2,
} as const;

const coverageStatusClassNames = {
  covered: "border-emerald-100 bg-emerald-50 text-emerald-700",
  "in-progress": "border-amber-100 bg-amber-50 text-amber-700",
  "weak-evidence": "border-orange-100 bg-orange-50 text-orange-700",
  "not-explored": "border-zinc-200 bg-zinc-50 text-zinc-500",
  "pending-analysis": "border-sky-100 bg-sky-50 text-sky-700",
} as const;

const coverageStatusLabels = {
  covered: "Covered",
  "in-progress": "In Progress",
  "weak-evidence": "Weak evidence",
  "not-explored": "Not explored",
  "pending-analysis": "Pending analysis",
} as const;

const evidenceStrengthBars = {
  high: 4,
  medium: 3,
  low: 2,
  none: 0,
} as const;

const reasoningStatusClassNames = {
  completed: "border-emerald-100 bg-emerald-50 text-emerald-700",
  "in-progress": "border-amber-100 bg-amber-50 text-amber-700",
  planned: "border-sky-100 bg-sky-50 text-sky-700",
} as const;

const reasoningStatusLabels = {
  completed: "Completed",
  "in-progress": "In Progress",
  planned: "Planned",
} as const;

export function getDebriefTab(
  value: string | string[] | undefined,
): DebriefTab {
  const normalizedValue = Array.isArray(value) ? value[0] : value;

  if (tabs.some((tab) => tab.id === normalizedValue)) {
    return normalizedValue as DebriefTab;
  }

  return "summary";
}

function DebriefPageCard({
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

function DebriefSectionHeading({
  icon: Icon,
  title,
  action,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-4 px-5 py-4 sm:px-6">
      <div className="flex items-center gap-3">
        <div className="flex size-8 items-center justify-center rounded-xl bg-primary/8 text-primary">
          <Icon className="size-4" />
        </div>
        <h2 className="text-[0.96rem] font-semibold tracking-tight text-zinc-950">
          {title}
        </h2>
      </div>
      {action}
    </div>
  );
}

function DebriefHeader({ debrief }: { debrief: InterviewDebriefModel }) {
  return (
    <section className="flex flex-col gap-5">
      <Link
        href={`/studies/${debrief.studyId}`}
        className="inline-flex w-fit items-center gap-2 text-sm font-medium text-zinc-600 transition-colors hover:text-zinc-950"
      >
        <ArrowLeft className="size-4" />
        Back to Study
      </Link>

      <div className="flex flex-col gap-5 md:flex-row md:items-start md:justify-between md:gap-8">
        <div className="min-w-0 flex-1 space-y-2">
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="font-heading text-[1.9rem] leading-none font-semibold tracking-tight text-zinc-950 sm:text-[2.2rem]">
              {debrief.title}
            </h1>
            <Badge
              variant="secondary"
              className="rounded-full border-zinc-200 bg-zinc-50 px-3 py-1 text-[11px] font-semibold text-zinc-700"
            >
              {debrief.participantLabel}
            </Badge>
          </div>
          <p className="text-[15px] leading-7 text-zinc-500">
            {debrief.subtitle}
          </p>
        </div>

        <div className="flex shrink-0 items-center gap-3">
          <Button
            type="button"
            variant="outline"
            size="lg"
            className="rounded-xl border-zinc-200 bg-white px-4 text-sm font-medium text-zinc-800 shadow-none hover:bg-zinc-50"
          >
            <FileDown className="size-4" />
            Export
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
  );
}

function DebriefTabs({
  activeTab,
  debrief,
}: {
  activeTab: DebriefTab;
  debrief: InterviewDebriefModel;
}) {
  const basePath = `/studies/${debrief.studyId}/interviews/${debrief.sessionId}/debrief`;

  return (
    <div className="overflow-x-auto border-b border-zinc-200/80">
      <div className="grid min-w-full grid-cols-4 px-2 sm:px-4">
        {tabs.map((tab) => {
          const active = tab.id === activeTab;
          const href =
            tab.id === "summary" ? basePath : `${basePath}?tab=${tab.id}`;

          return (
            <Link
              key={tab.id}
              href={href}
              aria-current={active ? "page" : undefined}
              className={cn(
                "border-b-2 px-1 py-4 text-center text-[12px] font-medium whitespace-nowrap transition-colors sm:px-2 sm:text-[13px]",
                active
                  ? "border-primary text-primary"
                  : "border-transparent text-zinc-500 hover:text-zinc-900",
              )}
            >
              {tab.label}
            </Link>
          );
        })}
      </div>
    </div>
  );
}

function EvidenceListItem({
  evidence,
  alignEnd = false,
}: {
  evidence: InterviewDebriefEvidenceItem;
  alignEnd?: boolean;
}) {
  return (
    <div className="flex items-start gap-3 rounded-[16px] border border-zinc-200/80 px-4 py-2.5 sm:items-center">
      <div className="flex size-7 shrink-0 items-center justify-center rounded-full bg-primary/8 text-primary">
        <Quote className="size-3.5" />
      </div>
      <div className="flex min-w-0 flex-1 flex-col gap-1.5 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
        <p className="min-w-0 flex-1 text-[13px] leading-5 text-zinc-700 sm:truncate">
          &ldquo;{evidence.quote}&rdquo;
        </p>
        <div
          className={cn(
            "flex items-center gap-3 text-[11px] font-medium text-zinc-500 sm:shrink-0",
            alignEnd && "sm:justify-end",
          )}
        >
          <span>{evidence.timestamp}</span>
          <span>{evidence.label}</span>
        </div>
      </div>
    </div>
  );
}

function SummaryPanel({ debrief }: { debrief: InterviewDebriefModel }) {
  const evidenceById = new Map(
    debrief.evidence.map((item) => [item.id, item] as const),
  );
  const evidenceItems = debrief.summary.evidenceIds.flatMap((evidenceId) => {
    const evidence = evidenceById.get(evidenceId);
    return evidence ? [evidence] : [];
  });

  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,0.94fr)_minmax(0,1.06fr)]">
      <div className="min-w-0 space-y-5">
        <DebriefPageCard className="min-w-0">
          <DebriefSectionHeading icon={Sparkles} title="Key Takeaway" />
          <div className="px-5 pb-5 sm:px-6 sm:pb-6">
            <p className="text-[14px] leading-7 text-zinc-700">
              {debrief.summary.keyTakeaway}
            </p>
          </div>
        </DebriefPageCard>

        <DebriefPageCard className="min-w-0">
          <DebriefSectionHeading icon={Target} title="Top Themes" />
          <div className="space-y-4 px-5 pb-5 sm:px-6 sm:pb-6">
            {debrief.summary.topThemes.map((theme) => {
              const strength = themeStrengthClassNames[theme.strength];
              const filledBars = themeStrengthBars[theme.strength];

              return (
                <div
                  key={theme.label}
                  className="grid grid-cols-[minmax(0,1fr)_96px_44px] items-center gap-2 sm:grid-cols-[minmax(0,1fr)_160px_56px] sm:gap-3"
                >
                  <p className="min-w-0 text-[13px] text-zinc-700">
                    {theme.label}
                  </p>
                  <div className="flex items-center gap-1.5">
                    {Array.from({ length: 4 }).map((_, index) => (
                      <span
                        key={index}
                        className={cn(
                          "h-1.5 flex-1 rounded-full bg-zinc-200",
                          index < filledBars && strength.fill,
                        )}
                      />
                    ))}
                  </div>
                  <span
                    className={cn(
                      "text-right text-[11px] font-medium sm:text-[12px]",
                      strength.text,
                    )}
                  >
                    {strength.label}
                  </span>
                </div>
              );
            })}
          </div>
        </DebriefPageCard>
      </div>

      <div className="min-w-0 space-y-5">
        <DebriefPageCard className="min-w-0">
          <DebriefSectionHeading
            icon={Quote}
            title="Strong Evidence"
            action={
              <button
                type="button"
                className="text-[12px] font-semibold text-primary transition-colors hover:text-primary/85"
              >
                View all
              </button>
            }
          />
          <div className="space-y-2.5 px-5 pb-5 sm:px-6 sm:pb-6">
            {evidenceItems.map((evidence) => (
              <EvidenceListItem key={evidence.id} evidence={evidence} alignEnd />
            ))}
          </div>
        </DebriefPageCard>

        <div className="grid min-w-0 gap-5 xl:grid-cols-[minmax(0,1.2fr)_minmax(240px,0.8fr)]">
          <DebriefPageCard className="min-w-0">
            <DebriefSectionHeading
              icon={Lightbulb}
              title="Recommended Follow-up"
            />
            <div className="px-5 pb-5 sm:px-6 sm:pb-6">
              <ul className="space-y-3">
                {debrief.summary.recommendedFollowUp.map((question) => (
                  <li
                    key={question}
                    className="flex items-start gap-3 text-[13px] leading-6 text-zinc-700"
                  >
                    <span className="mt-2 size-1.5 shrink-0 rounded-full bg-primary/65" />
                    <span>{question}</span>
                  </li>
                ))}
              </ul>
            </div>
          </DebriefPageCard>

          <DebriefPageCard className="min-w-0">
            <DebriefSectionHeading
              icon={ShieldQuestion}
              title="Why this matters"
            />
            <div className="px-5 pb-5 sm:px-6 sm:pb-6">
              <p className="text-[13px] leading-6 text-zinc-700">
                {debrief.summary.whyThisMatters}
              </p>
            </div>
          </DebriefPageCard>
        </div>
      </div>
    </div>
  );
}

function CoveragePanel({ debrief }: { debrief: InterviewDebriefModel }) {
  return (
    <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1.18fr)_minmax(300px,0.82fr)]">
      <div className="space-y-5">
        <DebriefPageCard>
          <DebriefSectionHeading
            icon={Target}
            title="Research Objective"
          />
          <div className="px-5 pb-5 sm:px-6 sm:pb-6">
            <p className="text-[14px] leading-7 text-zinc-700">
              {debrief.coverage.researchObjective}
            </p>
          </div>
        </DebriefPageCard>

        <DebriefPageCard>
          <DebriefSectionHeading
            icon={Sparkles}
            title="Topic Coverage"
          />
          <div className="px-5 pb-5 sm:px-6 sm:pb-6">
            <div className="hidden sm:grid grid-cols-[minmax(0,1.45fr)_140px_150px] gap-3 border-b border-zinc-200/80 pb-2 text-[11px] font-medium uppercase tracking-[0.08em] text-zinc-400">
              <span>Topic</span>
              <span className="text-center">Status</span>
              <span>Evidence strength</span>
            </div>

            <div className="divide-y divide-zinc-200/80">
              {debrief.coverage.topics.map((topic) => (
                <div
                  key={topic.id}
                  className="grid gap-3 py-4 sm:grid-cols-[minmax(0,1.45fr)_140px_150px] sm:items-center"
                >
                  <p className="text-[13px] leading-6 text-zinc-700">
                    {topic.topic}
                  </p>
                  <div className="sm:text-center">
                    <Badge
                      variant="outline"
                      className={cn(
                        "rounded-full px-3 py-1 text-[11px] font-semibold",
                        coverageStatusClassNames[topic.status],
                      )}
                    >
                      {coverageStatusLabels[topic.status]}
                    </Badge>
                  </div>
                  <div className="flex items-center gap-1.5">
                    {Array.from({ length: 4 }).map((_, index) => (
                      <span
                        key={index}
                        className={cn(
                          "h-1.5 flex-1 rounded-full bg-zinc-200",
                          index < evidenceStrengthBars[topic.evidenceStrength] &&
                            "bg-[linear-gradient(90deg,#8b5cf6,#4f46e5)]",
                        )}
                      />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </DebriefPageCard>
      </div>

      <div className="space-y-5">
        <DebriefPageCard>
          <DebriefSectionHeading icon={ShieldQuestion} title="Missed Areas" />
          <div className="px-5 pb-5 sm:px-6 sm:pb-6">
            <ul className="space-y-3">
              {debrief.coverage.missedAreas.map((item) => (
                <li
                  key={item}
                  className="flex items-start gap-3 text-[13px] leading-6 text-zinc-700"
                >
                  <span className="mt-2 size-1.5 shrink-0 rounded-full bg-primary/65" />
                  <span>{item}</span>
                </li>
              ))}
            </ul>

            <button
              type="button"
              className="mt-5 text-[12px] font-semibold text-primary transition-colors hover:text-primary/85"
            >
              View suggestions
            </button>
          </div>
        </DebriefPageCard>

        <DebriefPageCard>
          <DebriefSectionHeading
            icon={Lightbulb}
            title="Interview Quality"
          />
          <div className="space-y-4 px-5 pb-5 sm:px-6 sm:pb-6">
            <div className="flex items-center justify-between gap-4 text-[13px]">
              <span className="text-zinc-500">Coverage</span>
              <span className="font-semibold text-zinc-950">
                {debrief.coverage.interviewQuality.coverage}
              </span>
            </div>
            <div className="flex items-center justify-between gap-4 text-[13px]">
              <span className="text-zinc-500">Depth</span>
              <span className="font-semibold text-zinc-950">
                {debrief.coverage.interviewQuality.depth}
              </span>
            </div>
            <div className="flex items-center justify-between gap-4 text-[13px]">
              <span className="text-zinc-500">Participant engagement</span>
              <span className="font-semibold text-emerald-600">
                {debrief.coverage.interviewQuality.participantEngagement}
              </span>
            </div>
          </div>
        </DebriefPageCard>
      </div>
    </div>
  );
}

function ReasoningStatus({
  row,
}: {
  row: InterviewDebriefReasoningRow;
}) {
  return (
    <Badge
      variant="outline"
      className={cn(
        "rounded-full px-3 py-1 text-[11px] font-semibold",
        reasoningStatusClassNames[row.status],
      )}
    >
      {reasoningStatusLabels[row.status]}
    </Badge>
  );
}

function ReasoningPanel({ debrief }: { debrief: InterviewDebriefModel }) {
  return (
    <div>
      <div className="hidden md:grid grid-cols-[84px_1.05fr_1.3fr_1.15fr_124px] gap-4 border-b border-zinc-200/80 px-5 py-4 text-[11px] font-medium uppercase tracking-[0.08em] text-zinc-400 sm:px-6">
        <span>Time</span>
        <span>Trigger</span>
        <span>AI Decision</span>
        <span>Research Purpose</span>
        <span />
      </div>

      <div className="divide-y divide-zinc-200/80">
        {debrief.reasoning.map((row) => (
          <div
            key={row.id}
            className="grid gap-4 px-5 py-4 md:grid-cols-[84px_1.05fr_1.3fr_1.15fr_124px] md:items-start sm:px-6"
          >
            <p className="text-[12px] font-medium text-zinc-500">
              {row.timestamp}
            </p>
            <p className="text-[13px] leading-6 text-zinc-700">{row.trigger}</p>
            <p className="text-[13px] leading-6 text-zinc-700">
              {row.aiDecision}
            </p>
            <p className="text-[13px] leading-6 text-zinc-700">
              {row.researchPurpose}
            </p>
            <div className="md:text-right">
              <ReasoningStatus row={row} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function DebriefContent({
  activeTab,
  debrief,
}: {
  activeTab: DebriefTab;
  debrief: InterviewDebriefModel;
}) {
  switch (activeTab) {
    case "transcript":
      return (
        <InterviewDebriefTranscriptPanel
          evidence={debrief.evidence}
          transcript={debrief.transcript}
        />
      );
    case "coverage":
      return <CoveragePanel debrief={debrief} />;
    case "ai-reasoning":
      return <ReasoningPanel debrief={debrief} />;
    case "summary":
    default:
      return <SummaryPanel debrief={debrief} />;
  }
}

export function InterviewDebriefPage({
  activeTab,
  debrief,
}: {
  activeTab: DebriefTab;
  debrief: InterviewDebriefModel;
}) {
  return (
    <div className="min-h-full bg-[linear-gradient(180deg,rgba(255,255,255,0.97),rgba(248,250,252,0.98))]">
      <div className="flex w-full flex-col gap-6 px-4 py-7 sm:px-6 lg:px-6 lg:py-9 xl:px-8 2xl:px-12">
        <DebriefHeader debrief={debrief} />

        <DebriefPageCard className="overflow-hidden border-transparent bg-transparent shadow-none">
          <DebriefTabs activeTab={activeTab} debrief={debrief} />
          <div className="p-4 sm:p-5 lg:p-6">
            <DebriefContent activeTab={activeTab} debrief={debrief} />
          </div>
        </DebriefPageCard>
      </div>
    </div>
  );
}
