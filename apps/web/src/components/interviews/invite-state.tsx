import { CircleAlert, Clock3 } from "lucide-react";

import {
  InterviewCardFrame,
  InterviewPublicShell,
} from "@/components/interviews/participant-shell";

export function InterviewInviteState({
  description,
  title,
  variant = "invalid",
}: {
  description: string;
  title: string;
  variant?: "expired" | "invalid" | "unavailable";
}) {
  const Icon = variant === "expired" ? Clock3 : CircleAlert;

  return (
    <InterviewPublicShell>
      <div className="w-full max-w-xl">
        <InterviewCardFrame>
          <div className="space-y-6 px-8 py-10 text-center sm:px-10">
            <div className="mx-auto flex size-16 items-center justify-center rounded-full bg-amber-50 text-amber-600">
              <Icon className="size-7" />
            </div>
            <div className="space-y-2">
              <h1 className="text-[1.75rem] leading-tight font-semibold tracking-tight text-zinc-950">
                {title}
              </h1>
              <p className="text-[15px] leading-7 text-zinc-500">{description}</p>
            </div>
          </div>
        </InterviewCardFrame>
      </div>
    </InterviewPublicShell>
  );
}
