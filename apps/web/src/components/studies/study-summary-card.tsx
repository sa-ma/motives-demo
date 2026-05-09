import Link from "next/link";
import { Activity, ArrowRight, Ellipsis, Sparkles, UsersRound } from "lucide-react";

import type { StudySummaryCardModel } from "@/components/studies/studies.mock";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

const accentClasses = {
  interviewing: {
    interviewsIcon: "text-blue-600",
    buttonVariant: "default",
    status: "bg-blue-50 text-blue-700 border-blue-100",
    progress: "bg-[linear-gradient(90deg,#3b82f6,#2563eb)]",
    surface:
      "border-blue-100/80 bg-[linear-gradient(180deg,rgba(239,246,255,0.9),rgba(248,251,255,0.94))] text-blue-800",
    chip: "bg-blue-50 text-blue-700 border-blue-100",
    signal: "bg-blue-50 text-blue-700",
    cta: "min-w-[174px] justify-center border border-blue-600 bg-primary text-primary-foreground hover:bg-primary/90 hover:text-primary-foreground",
  },
  planning: {
    interviewsIcon: "text-sky-600",
    buttonVariant: "outline",
    status: "bg-sky-50 text-sky-700 border-sky-100",
    progress: "bg-[linear-gradient(90deg,#60a5fa,#3b82f6)]",
    surface:
      "border-sky-100/80 bg-[linear-gradient(180deg,rgba(239,246,255,0.9),rgba(245,250,255,0.92))] text-sky-800",
    chip: "bg-sky-50 text-sky-700 border-sky-100",
    signal: "bg-sky-50 text-sky-700",
    cta: "min-w-[174px] justify-center border border-blue-300 bg-white text-primary ring-1 ring-inset ring-blue-200 hover:border-blue-300 hover:bg-sky-50 hover:text-sky-700",
  },
  analyzing: {
    interviewsIcon: "text-amber-600",
    buttonVariant: "outline",
    status: "bg-amber-50 text-amber-700 border-amber-100",
    progress: "bg-[linear-gradient(90deg,#f59e0b,#f97316)]",
    surface:
      "border-amber-100/80 bg-[linear-gradient(180deg,rgba(255,247,237,0.92),rgba(255,251,245,0.94))] text-amber-800",
    chip: "bg-amber-50 text-amber-700 border-amber-100",
    signal: "bg-amber-50 text-amber-700",
    cta: "min-w-[174px] justify-center border border-orange-300 bg-white text-orange-600 ring-1 ring-inset ring-orange-200 hover:border-orange-300 hover:bg-orange-50 hover:text-orange-700",
  },
  completed: {
    interviewsIcon: "text-emerald-600",
    buttonVariant: "outline",
    status: "bg-emerald-50 text-emerald-700 border-emerald-100",
    progress: "bg-[linear-gradient(90deg,#22c55e,#16a34a)]",
    surface:
      "border-emerald-100/80 bg-[linear-gradient(180deg,rgba(236,253,245,0.92),rgba(244,255,249,0.94))] text-emerald-800",
    chip: "bg-emerald-50 text-emerald-700 border-emerald-100",
    signal: "bg-emerald-50 text-emerald-700",
    cta: "min-w-[174px] justify-center border border-emerald-300 bg-white text-emerald-700 ring-1 ring-inset ring-emerald-200 hover:border-emerald-300 hover:bg-emerald-50/60 hover:text-emerald-800",
  },
} as const;

export function StudySummaryCard({ study }: { study: StudySummaryCardModel }) {
  const accent = accentClasses[study.accent];
  const primaryActionHref =
    study.accent === "planning"
      ? `/studies/${study.id}/plan`
      : `/studies/${study.id}`;

  return (
    <Card className="rounded-3xl border-zinc-200/70 bg-white/95 shadow-[0_24px_80px_-36px_rgba(15,23,42,0.22)]">
      <CardContent className="space-y-6 p-6">
        <div className="flex items-start justify-between gap-4">
          <div className="space-y-4">
            <Badge
              variant="secondary"
              className={cn(
                "rounded-full border px-2.5 py-1 text-[11px] font-semibold",
                accent.status,
              )}
            >
              {study.statusLabel}
            </Badge>

            <div className="space-y-2.5">
              <h2 className="max-w-[28rem] text-[1.1rem] leading-8 font-semibold tracking-tight text-zinc-950">
                {study.title}
              </h2>
              <p className="max-w-[31rem] text-[14px] leading-6 text-zinc-500">
                {study.description}
              </p>
            </div>
          </div>

          <div className="flex shrink-0 items-center gap-2 pt-1 text-zinc-500">
            <UsersRound className={cn("size-4", accent.interviewsIcon)} />
            <div className="text-left">
              <p className="text-sm font-semibold text-zinc-900">
                {study.interviewsCompleted} / {study.interviewsTarget}
              </p>
              <p className="text-[13px]">Interviews</p>
            </div>
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_220px] sm:items-center">
          <div className="space-y-2">
            <div className="flex items-center justify-between gap-3 text-[14px]">
              <span className="font-medium text-zinc-700">Coverage</span>
              <span className="font-semibold text-zinc-900">{study.coverage}%</span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-zinc-100">
              <div
                className={cn("h-full rounded-full", accent.progress)}
                style={{ width: `${study.coverage}%` }}
              />
            </div>
          </div>

          <div className="flex items-center gap-3 border-zinc-200/80 sm:border-l sm:pl-6">
            <div
              className={cn(
                "inline-flex size-9 items-center justify-center rounded-full",
                accent.signal,
              )}
            >
              <Activity className="size-4" />
            </div>
            <div className="text-[14px]">
              <p className="font-medium text-zinc-700">Strong signals</p>
              <p className="text-zinc-500">
                <span className="mr-1 font-semibold text-zinc-900">{study.signalCount}</span>
                detected
              </p>
            </div>
          </div>
        </div>

        <div className="space-y-3">
          <p className="text-[14px] font-medium text-zinc-700">{study.themeLabel}</p>
          <div className="flex flex-wrap gap-2">
            {study.themes.map((theme) => (
              <Badge
                key={theme}
                variant="secondary"
                className={cn(
                  "rounded-lg border px-2.5 py-1 text-[12px] font-medium",
                  accent.chip,
                )}
              >
                {theme}
              </Badge>
            ))}
            {study.hiddenThemesCount ? (
              <Badge
                variant="secondary"
                className={cn(
                  "rounded-lg border px-2.5 py-1 text-[12px] font-medium",
                  accent.chip,
                )}
              >
                +{study.hiddenThemesCount}
              </Badge>
            ) : null}
          </div>
        </div>

        <div className={cn("rounded-2xl border p-4", accent.surface)}>
          <div className="flex items-start gap-3">
            <div className="inline-flex size-8 shrink-0 items-center justify-center rounded-full bg-white/70">
              <Sparkles className="size-4" />
            </div>
            <div className="space-y-1">
              <p className="text-[12px] font-semibold">AI Observation</p>
              <p className="text-[12px] leading-6">{study.observation}</p>
            </div>
          </div>
        </div>

        <div className="flex flex-col gap-3 border-t border-zinc-100 pt-4 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-[14px] text-zinc-500">{study.updatedLabel}</p>

          <div className="flex items-center gap-3">
            {primaryActionHref ? (
              <Link
                href={primaryActionHref}
                className={buttonVariants({
                  variant: accent.buttonVariant,
                  size: "lg",
                  className: cn("rounded-xl px-4 shadow-none", accent.cta),
                })}
              >
                {study.actionLabel}
                <ArrowRight className="size-4" />
              </Link>
            ) : (
              <button
                type="button"
                className={buttonVariants({
                  variant: accent.buttonVariant,
                  size: "lg",
                  className: cn("rounded-xl px-4 shadow-none", accent.cta),
                })}
              >
                {study.actionLabel}
                <ArrowRight className="size-4" />
              </button>
            )}
            <button
              type="button"
              className="inline-flex size-10 items-center justify-center rounded-xl border border-zinc-200/80 bg-white text-zinc-500 shadow-none transition-colors hover:bg-zinc-50 hover:text-zinc-700"
              aria-label={`More actions for ${study.title}`}
            >
              <Ellipsis className="size-5" />
            </button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
