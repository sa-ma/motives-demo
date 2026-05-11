"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useEffect, useState } from "react";
import { Activity, Archive, ArrowRight, Copy, Ellipsis, Sparkles, UsersRound } from "lucide-react";

import type { StudySummary as StudySummaryCardModel } from "@motives-ai/contracts";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { browserApiClient } from "@/lib/api/client";
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
    interviewsIcon: "text-violet-600",
    buttonVariant: "outline",
    status: "bg-violet-50 text-violet-700 border-violet-100",
    progress: "bg-[linear-gradient(90deg,#a78bfa,#8b5cf6)]",
    surface:
      "border-violet-100/80 bg-[linear-gradient(180deg,rgba(245,243,255,0.92),rgba(250,248,255,0.94))] text-violet-800",
    chip: "bg-violet-50 text-violet-700 border-violet-100",
    signal: "bg-violet-50 text-violet-700",
    cta: "min-w-[174px] justify-center border border-violet-300 bg-white text-violet-700 ring-1 ring-inset ring-violet-200 hover:border-violet-300 hover:bg-violet-50/60 hover:text-violet-800",
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
  archived: {
    interviewsIcon: "text-zinc-500",
    buttonVariant: "outline",
    status: "bg-zinc-100 text-zinc-700 border-zinc-200",
    progress: "bg-[linear-gradient(90deg,#a1a1aa,#71717a)]",
    surface:
      "border-zinc-200/80 bg-[linear-gradient(180deg,rgba(244,244,245,0.92),rgba(250,250,250,0.94))] text-zinc-700",
    chip: "bg-zinc-100 text-zinc-700 border-zinc-200",
    signal: "bg-zinc-100 text-zinc-600",
    cta: "min-w-[174px] justify-center border border-zinc-300 bg-white text-zinc-700 ring-1 ring-inset ring-zinc-200 hover:border-zinc-300 hover:bg-zinc-50 hover:text-zinc-800",
  },
} as const;

async function copyTextToClipboard(text: string) {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }

  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.setAttribute("readonly", "");
  textarea.style.position = "absolute";
  textarea.style.left = "-9999px";
  document.body.appendChild(textarea);
  textarea.select();
  document.execCommand("copy");
  document.body.removeChild(textarea);
}

export function StudySummaryCard({ study }: { study: StudySummaryCardModel }) {
  const queryClient = useQueryClient();
  const accent = accentClasses[study.accent];
  const primaryActionHref =
    study.accent === "planning"
      ? `/studies/${study.id}/plan`
      : `/studies/${study.id}`;
  const primaryActionLabel =
    study.actionLabel === "Continue Study" ? "View Study" : study.actionLabel;
  const [actionMessage, setActionMessage] = useState<{
    text: string;
    tone: "default" | "error" | "success";
  } | null>(null);
  const archiveStudyMutation = useMutation({
    mutationFn: () => browserApiClient.studies.archive(study.id),
    onSuccess: async () => {
      setActionMessage({
        text: "Study archived",
        tone: "success",
      });
      await queryClient.invalidateQueries({ queryKey: ["studies"] });
    },
    onError: () => {
      setActionMessage({
        text: "Could not archive study",
        tone: "error",
      });
    },
  });

  useEffect(() => {
    if (!actionMessage) {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      setActionMessage(null);
    }, 3200);

    return () => window.clearTimeout(timeoutId);
  }, [actionMessage]);

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
              <p className="text-[13px]">Participants</p>
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
          {study.themes.length > 0 ? (
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
          ) : (
            <p className="text-[13px] leading-6 text-zinc-500">
              Completed interviews are waiting for debrief analysis.
            </p>
          )}
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
          <p
            className={cn(
              "text-[14px]",
              actionMessage?.tone === "success"
                ? "text-emerald-600"
                : actionMessage?.tone === "error"
                  ? "text-rose-600"
                  : "text-zinc-500",
            )}
          >
            {actionMessage?.text ?? study.updatedLabel}
          </p>
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
                {primaryActionLabel}
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
                {primaryActionLabel}
                <ArrowRight className="size-4" />
              </button>
            )}
            <DropdownMenu>
              <DropdownMenuTrigger
                aria-label={`More actions for ${study.title}`}
                className={buttonVariants({
                  variant: "outline",
                  size: "icon-lg",
                  className:
                    "rounded-xl border-zinc-200 bg-white text-zinc-500 shadow-none hover:bg-zinc-50 hover:text-zinc-700",
                })}
              >
                <Ellipsis className="size-5" />
              </DropdownMenuTrigger>
              <DropdownMenuContent>
                <DropdownMenuItem
                  disabled={!study.latestInviteUrl}
                  onClick={() => {
                    if (!study.latestInviteUrl) {
                      return;
                    }

                    void copyTextToClipboard(study.latestInviteUrl)
                      .then(async () => {
                        setActionMessage({
                          text: "Invite link copied",
                          tone: "success",
                        });
                        await queryClient.invalidateQueries({ queryKey: ["studies"] });
                      })
                      .catch(() => {
                        setActionMessage({
                          text: "Could not copy invite link",
                          tone: "error",
                        });
                      });
                  }}
                >
                  <span className="flex items-center gap-2">
                    <Copy className="size-4 text-zinc-400" />
                    {study.latestInviteUrl ? "Copy invite link" : "No invite link yet"}
                  </span>
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  disabled={!study.canArchiveStudy || archiveStudyMutation.isPending}
                  onClick={() => {
                    if (!study.canArchiveStudy || archiveStudyMutation.isPending) {
                      return;
                    }

                    archiveStudyMutation.mutate();
                  }}
                  className="text-rose-700 data-[highlighted]:bg-rose-50 data-[highlighted]:text-rose-800"
                >
                  <span className="flex items-center gap-2">
                    <Archive className="size-4 text-rose-500" />
                    {archiveStudyMutation.isPending ? "Archiving study..." : "Archive study"}
                  </span>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
