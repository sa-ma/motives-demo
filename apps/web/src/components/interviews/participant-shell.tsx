import { Sparkles } from "lucide-react";

import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export function InterviewPublicShell({
  children,
  mode = "centered",
}: {
  children: React.ReactNode;
  mode?: "centered" | "room";
}) {
  return (
    <div
      className={cn(
        "bg-[radial-gradient(circle_at_top,_rgba(29,78,216,0.08),_transparent_30%),linear-gradient(180deg,#f8fafc_0%,#ffffff_100%)]",
        mode === "centered" ? "min-h-screen" : "h-screen overflow-hidden",
      )}
    >
      <div
        className={cn(
          "mx-auto w-full",
          mode === "centered"
            ? "flex min-h-screen max-w-5xl items-stretch justify-center px-0 py-0 sm:items-center sm:px-6 sm:py-10 lg:px-8"
            : "flex h-full max-w-[1440px] overflow-hidden px-4 py-4 sm:px-6 sm:py-6 lg:px-8",
        )}
      >
        {children}
      </div>
    </div>
  );
}

export function InterviewCardFrame({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <Card
      className={cn(
        "min-h-screen w-full rounded-none border-0 bg-white/96 shadow-none sm:min-h-0 sm:rounded-[28px] sm:border sm:border-zinc-200/80 sm:shadow-[0_32px_90px_-48px_rgba(15,23,42,0.28)]",
        className,
      )}
    >
      <CardContent className="p-0">{children}</CardContent>
    </Card>
  );
}

export function InterviewBrandLockup({
  caption = "Participant interview",
}: {
  caption?: string;
}) {
  return (
    <div className="mb-6 flex items-center justify-center gap-3 text-center">
      <div className="flex size-11 items-center justify-center rounded-2xl bg-primary/8 text-primary shadow-[0_16px_30px_-22px_rgba(29,78,216,0.5)]">
        <Sparkles className="size-5" />
      </div>
      <div className="text-left">
        <p className="text-[14px] font-semibold text-zinc-950">Motives AI</p>
        <p className="text-[13px] text-zinc-500">{caption}</p>
      </div>
    </div>
  );
}
