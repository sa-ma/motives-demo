"use client";

import { useEffect, useMemo, useState } from "react";
import { Quote, Search, X } from "lucide-react";

import type {
  SessionDebriefEvidenceItem as InterviewDebriefEvidenceItem,
  SessionDebriefTranscriptRow as InterviewDebriefTranscriptRow,
} from "@motives-ai/contracts";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

const speakerClassNames = {
  ai: "bg-primary/10 text-primary",
  participant: "bg-emerald-50 text-emerald-700",
} as const;

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

function TranscriptEvidencePanel({
  evidence,
  onClose,
  className,
}: {
  evidence: InterviewDebriefEvidenceItem;
  onClose: () => void;
  className?: string;
}) {
  return (
    <DebriefPageCard className={cn("h-fit lg:sticky lg:top-6", className)}>
      <div className="flex items-center justify-between gap-4 border-b border-zinc-200/80 px-5 py-4 sm:px-6">
        <h2 className="text-[0.88rem] font-semibold tracking-tight text-zinc-950">
          Evidence Details
        </h2>
        <button
          type="button"
          onClick={onClose}
          className="text-zinc-400 transition-colors hover:text-zinc-700"
          aria-label="Close evidence details"
        >
          <X className="size-4" />
        </button>
      </div>
      <div className="space-y-5 px-5 pt-5 pb-5 sm:px-6 sm:pt-6 sm:pb-6">
        <div>
          <p className="text-[12px] font-semibold text-zinc-500">
            Selected Quote
          </p>
          <div className="mt-2 rounded-[16px] bg-zinc-50 p-4">
            <div className="flex items-start gap-3">
              <div className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full bg-primary/8 text-primary">
                <Quote className="size-3.5" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-[13px] leading-6 text-zinc-700">
                  &ldquo;{evidence.quote}&rdquo;
                </p>
                <p className="mt-2 text-right text-[11px] font-medium text-zinc-500">
                  {evidence.timestamp}
                </p>
              </div>
            </div>
          </div>
        </div>

        <div>
          <p className="text-[12px] font-semibold text-zinc-500">Theme</p>
          <Badge className="mt-2 rounded-full px-3 py-1.5 text-[11px]">
            {evidence.theme}
          </Badge>
        </div>

        <div>
          <p className="text-[12px] font-semibold text-zinc-500">
            Why it matters
          </p>
          <p className="mt-2 text-[13px] leading-6 text-zinc-700">
            {evidence.whyItMatters}
          </p>
        </div>

        <div>
          <p className="text-[12px] font-semibold text-zinc-500">
            AI follow-up
          </p>
          <p className="mt-2 text-[13px] leading-6 text-zinc-700">
            {evidence.followUp}
          </p>
        </div>
      </div>
    </DebriefPageCard>
  );
}

function TranscriptRow({
  row,
  evidence,
  active,
  onSelect,
  showSpeakerMeta,
}: {
  row: InterviewDebriefTranscriptRow;
  evidence?: InterviewDebriefEvidenceItem;
  active: boolean;
  onSelect: () => void;
  showSpeakerMeta: boolean;
}) {
  const isSelectable = Boolean(evidence);

  return (
    <button
      type="button"
      onClick={onSelect}
      disabled={!isSelectable}
      className={cn(
        "w-full rounded-[12px] border border-transparent px-4 py-2 text-left transition-colors",
        row.speaker === "participant" ? "bg-transparent" : "bg-zinc-50/55",
        isSelectable &&
          "border-primary/25 hover:border-primary/40 hover:bg-primary/[0.03]",
        active && "border-primary bg-primary/[0.05]",
        !isSelectable && "cursor-default",
      )}
    >
      <div className="space-y-1.5 sm:hidden">
        {showSpeakerMeta ? (
          <div className="flex items-center gap-2">
            <span
              className={cn(
                "inline-flex size-6 shrink-0 items-center justify-center rounded-full text-[10px] font-semibold",
                speakerClassNames[row.speaker],
              )}
            >
              {row.speaker === "ai" ? "AI" : "P"}
            </span>
            <p className="min-w-0 text-[12px] font-medium text-zinc-900">
              {row.speakerLabel}
            </p>
          </div>
        ) : (
          <div className="flex items-center">
            <span
              className={cn(
                "inline-flex size-6 shrink-0 items-center justify-center rounded-full text-[10px] font-semibold",
                speakerClassNames[row.speaker],
              )}
            >
              {row.speaker === "ai" ? "AI" : "P"}
            </span>
          </div>
        )}

        <p className="text-[13px] leading-6 text-zinc-700">{row.text}</p>

        <div className="flex items-center justify-between gap-3">
          <p className="text-[11px] font-medium text-zinc-500">{row.timestamp}</p>
          {evidence ? (
            <Badge className="rounded-lg px-2.5 py-1 text-[11px]">
              {evidence.label}
            </Badge>
          ) : null}
        </div>
      </div>

      <div className="hidden sm:flex sm:items-start sm:gap-3">
        <div className="w-16 shrink-0 pt-0.5">
          <p className="text-[11px] font-medium text-zinc-500">{row.timestamp}</p>
        </div>

        <div className="shrink-0 pt-0.5">
          <span
            className={cn(
              "inline-flex size-6 items-center justify-center rounded-full text-[10px] font-semibold",
              speakerClassNames[row.speaker],
            )}
          >
            {row.speaker === "ai" ? "AI" : "P"}
          </span>
        </div>

        <div className="min-w-0 flex-1">
          {showSpeakerMeta ? (
            <>
              <p className="text-[12px] font-medium text-zinc-900">
                {row.speakerLabel}
              </p>
              <p className="mt-0.5 text-[13px] leading-6 text-zinc-700">
                {row.text}
              </p>
            </>
          ) : (
            <p className="pt-0.5 text-[13px] leading-6 text-zinc-700">
              {row.text}
            </p>
          )}
        </div>

        {evidence ? (
          <div className="shrink-0 self-start pt-0.5">
            <Badge className="rounded-lg px-2.5 py-1 text-[11px]">
              {evidence.label}
            </Badge>
          </div>
        ) : null}
      </div>
    </button>
  );
}

export function InterviewDebriefTranscriptPanel({
  evidence,
  transcript,
}: {
  evidence: InterviewDebriefEvidenceItem[];
  transcript: InterviewDebriefTranscriptRow[];
}) {
  const evidenceById = useMemo(
    () =>
      Object.fromEntries(
        evidence.map((item) => [item.id, item]),
      ) as Record<string, InterviewDebriefEvidenceItem>,
    [evidence],
  );
  const defaultEvidenceId = useMemo(
    () => transcript.find((row) => row.evidenceId)?.evidenceId ?? null,
    [transcript],
  );
  const [selectedEvidenceId, setSelectedEvidenceId] = useState<
    string | null | undefined
  >(undefined);
  const [isDesktop, setIsDesktop] = useState(false);

  useEffect(() => {
    const mediaQuery = window.matchMedia("(min-width: 1024px)");
    const syncViewport = () => setIsDesktop(mediaQuery.matches);

    syncViewport();
    mediaQuery.addEventListener("change", syncViewport);

    return () => mediaQuery.removeEventListener("change", syncViewport);
  }, []);

  const activeEvidenceId =
    selectedEvidenceId === undefined
      ? isDesktop
        ? defaultEvidenceId
        : null
      : selectedEvidenceId;
  const selectedEvidence = activeEvidenceId
    ? evidenceById[activeEvidenceId]
    : undefined;

  return (
    <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1.28fr)_minmax(300px,0.72fr)]">
      <div>
        <div className="px-3 py-3 sm:px-4 sm:py-4">
          <div className="flex items-center gap-3 rounded-[14px] border border-zinc-200 bg-white px-3 py-2.5">
            <Search className="size-4 text-zinc-400" />
            <p className="text-[13px] text-zinc-400">Search transcript...</p>
          </div>
        </div>

        <div className="max-h-[720px] space-y-1.5 overflow-y-auto px-3 pb-3 sm:px-4 sm:pb-4">
          {transcript.map((row, index) => {
            const matchedEvidence = row.evidenceId
              ? evidenceById[row.evidenceId]
              : undefined;
            const previousRow = transcript[index - 1];
            const showSpeakerMeta = previousRow?.speaker !== row.speaker;

            return (
              <TranscriptRow
                key={row.id}
                row={row}
                evidence={matchedEvidence}
                active={row.evidenceId === activeEvidenceId}
                showSpeakerMeta={showSpeakerMeta}
                onSelect={() => {
                  if (row.evidenceId) {
                    setSelectedEvidenceId(row.evidenceId);
                  }
                }}
              />
            );
          })}
        </div>
      </div>

      {selectedEvidence ? (
        <>
          <TranscriptEvidencePanel
            evidence={selectedEvidence}
            onClose={() => setSelectedEvidenceId(null)}
            className="hidden lg:block"
          />

          <Dialog
            open={!isDesktop && Boolean(selectedEvidence)}
            onOpenChange={(open) => {
              if (!open) {
                setSelectedEvidenceId(null);
              }
            }}
          >
            <DialogContent
              showCloseButton={false}
              className="max-w-[calc(100vw-1.5rem)] rounded-[18px] border border-zinc-200/80 bg-white p-0 shadow-[0_30px_80px_-32px_rgba(15,23,42,0.32)] lg:hidden"
            >
              <TranscriptEvidencePanel
                evidence={selectedEvidence}
                onClose={() => setSelectedEvidenceId(null)}
                className="border-0 bg-white shadow-none"
              />
            </DialogContent>
          </Dialog>
        </>
      ) : null}
    </div>
  );
}
