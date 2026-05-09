import { Check, Lock } from "lucide-react";

import { InterviewCardFrame } from "@/components/interviews/participant-shell";

export function CompleteScreen() {
  return (
    <div className="w-full max-w-[460px]">
      <InterviewCardFrame>
        <div className="space-y-6 px-8 py-9 text-center sm:px-9">
          <div className="mx-auto flex size-24 items-center justify-center rounded-full bg-[radial-gradient(circle_at_top,rgba(255,255,255,0.9),rgba(236,253,245,0.95))] shadow-[inset_0_0_0_1px_rgba(134,239,172,0.55)]">
            <Check className="size-9 text-emerald-600" strokeWidth={2.5} />
          </div>

          <div className="space-y-2">
            <h1 className="text-[1.55rem] leading-tight font-semibold tracking-tight text-zinc-950">
              Thank you for participating.
            </h1>
            <p className="text-[14px] leading-6 font-medium text-zinc-500">
              Your responses have been recorded successfully.
            </p>
          </div>

          <div className="space-y-4 pt-0.5">
            <div className="mx-auto h-px w-full max-w-[252px] bg-zinc-200/80" />
            <p className="mx-auto max-w-[260px] text-[14px] leading-6 font-medium text-zinc-500">
              Thanks, your answers will help improve the product experience.
            </p>
          </div>

          <div className="flex items-center justify-center gap-2.5 pt-0.5 text-[14px] leading-6 font-medium text-zinc-500">
            <Lock className="size-4 text-zinc-400" />
            <span>You may now close this window.</span>
          </div>
        </div>
      </InterviewCardFrame>
    </div>
  );
}
