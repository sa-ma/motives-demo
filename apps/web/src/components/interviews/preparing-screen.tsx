"use client";

import { Sparkles } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";

import {
  InterviewCardFrame,
} from "@/components/interviews/participant-shell";
import { Button } from "@/components/ui/button";
import { browserApiClient } from "@/lib/api/client";
import { cn } from "@/lib/utils";

const preparingSteps = [
  "Reviewing study goals",
  "Checking participant context",
  "Preparing the first question",
];

export function PreparingScreen({ inviteCode }: { inviteCode: string }) {
  const router = useRouter();
  const [activeStep, setActiveStep] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    const timers = [
      window.setTimeout(() => setActiveStep(1), 900),
      window.setTimeout(() => setActiveStep(2), 1800),
      window.setTimeout(() => {
        startTransition(async () => {
          try {
            await browserApiClient.publicInterviews.act(inviteCode, {
              action: "start-room",
            });
          } catch {
            setError("We hit a problem while preparing the interview.");
            return;
          }

          router.replace(`/interviews/${inviteCode}/room`);
        });
      }, 2600),
    ];

    return () => {
      timers.forEach((timer) => window.clearTimeout(timer));
    };
  }, [inviteCode, router, startTransition]);

  return (
    <div className="w-full max-w-xl">
      <InterviewCardFrame>
        <div className="space-y-8 px-8 py-10 sm:px-10">
          <div className="space-y-3 text-center">
            <div className="mx-auto flex size-18 items-center justify-center rounded-full bg-primary/8 text-primary">
              <Sparkles className="size-8" />
            </div>
            <h1 className="text-[1.9rem] leading-tight font-semibold tracking-tight text-zinc-950">
              Preparing your interview
            </h1>
            <p className="text-[15px] leading-7 text-zinc-500">
              This only takes a moment while we load the study context and personalize the opening prompt.
            </p>
          </div>

          <div className="space-y-4">
            {preparingSteps.map((step, index) => {
              const isComplete = index < activeStep;
              const isActive = index === activeStep;

              return (
                <div key={step} className="flex items-center gap-3">
                  <span
                    className={cn(
                      "flex size-6 items-center justify-center rounded-full border text-[12px] font-semibold transition-colors",
                      isComplete
                        ? "border-primary bg-primary text-white"
                        : isActive
                          ? "border-primary/40 text-primary"
                          : "border-zinc-300 text-zinc-400",
                    )}
                  >
                    {isComplete ? "✓" : index + 1}
                  </span>
                  <span
                    className={cn(
                      "text-[14px]",
                      isComplete || isActive ? "text-zinc-900" : "text-zinc-500",
                    )}
                  >
                    {step}
                  </span>
                </div>
              );
            })}
          </div>

          {error ? (
            <div className="space-y-3 rounded-[18px] border border-rose-100 bg-rose-50 px-4 py-4">
              <p className="text-[13px] text-rose-600">{error}</p>
              <Button
                type="button"
                variant="outline"
                onClick={() => window.location.reload()}
                className="rounded-xl border-rose-200 bg-white text-rose-700 hover:bg-rose-50"
              >
                Retry
              </Button>
            </div>
          ) : (
            <p className="text-center text-[13px] text-zinc-500">
              {isPending ? "Opening your interview room..." : "Hang tight while we finish setup."}
            </p>
          )}
        </div>
      </InterviewCardFrame>
    </div>
  );
}
