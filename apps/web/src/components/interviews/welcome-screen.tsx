"use client";

import { Clock3, Lock, MessageSquareQuote } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { InterviewCardFrame } from "@/components/interviews/participant-shell";
import { Button } from "@/components/ui/button";
import type { InterviewInvitePayload } from "@/lib/interviews/types";

const inviteHighlights = [
  {
    icon: Clock3,
    label: "Estimated time",
    valueKey: "estimatedDuration",
  },
  {
    icon: MessageSquareQuote,
    label: "Format",
    valueKey: "formatLabel",
  },
] as const;

export function WelcomeScreen({ invite }: { invite: InterviewInvitePayload }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  return (
    <div className="w-full max-w-[460px]">
      <InterviewCardFrame>
        <div className="space-y-5 px-5 py-6 sm:space-y-6 sm:px-9 sm:py-9">
          <div className="space-y-3 text-center sm:space-y-4">
            <div className="mx-auto flex size-16 items-center justify-center rounded-full bg-[radial-gradient(circle_at_top,rgba(255,255,255,0.95),rgba(238,242,255,0.95))] text-primary shadow-[inset_0_0_0_1px_rgba(129,140,248,0.18)] sm:size-18">
              <MessageSquareQuote className="size-7 sm:size-8" />
            </div>
            <div className="space-y-2">
              <h1 className="text-[1.55rem] leading-tight font-semibold tracking-tight text-zinc-950 sm:text-[1.8rem]">
                {invite.studyTitle}
              </h1>
              <p className="text-[14px] leading-6 font-medium text-zinc-500 sm:leading-7">
                {invite.introCopy}
              </p>
            </div>
          </div>

          <div className="mx-auto h-px w-full max-w-[300px] bg-zinc-200/80" />

          <div className="space-y-3">
            {inviteHighlights.map((item) => {
              const Icon = item.icon;
              const value = invite[item.valueKey];

              return (
                <div
                  key={item.label}
                  className="flex items-center justify-between gap-4 text-[13px] sm:text-[14px]"
                >
                  <div className="flex items-center gap-2.5 font-medium text-zinc-500">
                    <Icon className="size-4 text-primary" />
                    <span>{item.label}</span>
                  </div>
                  <span className="font-medium text-zinc-900">{value}</span>
                </div>
              );
            })}
          </div>

          <div className="flex items-start gap-3 text-[14px] leading-6 font-medium text-zinc-500">
            <Lock className="mt-0.5 size-4 shrink-0 text-zinc-400" />
            <p>You can skip any question and stop the interview at any time.</p>
          </div>

          {error ? (
            <p className="rounded-xl border border-rose-100 bg-rose-50 px-4 py-3 text-[13px] text-rose-600">
              {error}
            </p>
          ) : null}

          <Button
            type="button"
            size="lg"
            disabled={isPending}
            onClick={() => {
              setError(null);
              startTransition(async () => {
                const response = await fetch(`/api/interviews/${invite.inviteCode}/session`, {
                  body: JSON.stringify({ action: "advance-to-details" }),
                  headers: {
                    "Content-Type": "application/json",
                  },
                  method: "POST",
                });

                if (!response.ok) {
                  setError("Unable to start the interview right now.");
                  return;
                }

                router.push(`/interviews/${invite.inviteCode}/details`);
              });
            }}
            className="h-12 w-full rounded-md text-[15px] font-semibold shadow-[0_24px_48px_-24px_rgba(29,78,216,0.5)] sm:h-13"
          >
            {isPending ? "Starting…" : "Get Started"}
          </Button>
        </div>
      </InterviewCardFrame>
    </div>
  );
}
