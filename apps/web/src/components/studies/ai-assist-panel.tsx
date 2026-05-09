import { Check, Sparkles } from "lucide-react";

import { Card, CardContent } from "@/components/ui/card";

const assistBullets = [
  "Generate a focused interview plan",
  "Cover key topics that matter",
  "Adapt questions based on responses",
  "Extract powerful insights",
];

export function AiAssistPanel() {
  return (
    <Card className="relative overflow-hidden border-primary/15 bg-[linear-gradient(180deg,#f8fafc_0%,#eef2ff_100%)]">
      <CardContent className="relative flex h-full min-h-[500px] flex-col p-6">
        <div className="flex flex-col items-center text-center">
          <div className="flex size-12 items-center justify-center rounded-md bg-white text-primary shadow-[0_18px_40px_-24px_rgba(29,78,216,0.45)]">
            <Sparkles className="size-6" />
          </div>
          <h2 className="mt-5 text-[1.125rem] leading-tight font-semibold tracking-tight text-slate-950 md:text-[1.25rem]">
            AI will help you
          </h2>
        </div>

        <ul className="mt-7 space-y-4.5">
          {assistBullets.map((bullet) => (
            <li key={bullet} className="flex items-start gap-3 text-[14px] leading-7 text-slate-600">
              <span className="mt-1 flex size-5 items-center justify-center rounded-full bg-primary/10 text-primary">
                <Check className="size-3.5" />
              </span>
              <span>{bullet}</span>
            </li>
          ))}
        </ul>

        <div className="relative mt-auto flex min-h-[220px] items-end justify-center">
          <div className="relative flex items-end gap-4">
            <div className="mb-6 flex h-24 w-44 items-center rounded-md border border-white/70 bg-white/90 px-5 shadow-[0_20px_40px_-26px_rgba(15,23,42,0.28)]">
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <span className="size-5 rounded-full bg-primary/10" />
                  <span className="block h-2 w-16 rounded-full bg-zinc-200" />
                </div>
                <span className="block h-2 w-24 rounded-full bg-zinc-200" />
              </div>
            </div>
            <div className="mb-[4.5rem] flex h-20 w-40 items-center rounded-md border border-white/70 bg-white/88 px-5 shadow-[0_18px_34px_-26px_rgba(15,23,42,0.25)]">
              <div className="space-y-3">
                <span className="block h-2 w-20 rounded-full bg-zinc-200" />
                <span className="block h-2 w-24 rounded-full bg-zinc-200" />
              </div>
            </div>
            <div className="mb-10 flex h-[4.5rem] w-32 items-center rounded-md border border-white/70 bg-white/88 px-4 shadow-[0_18px_34px_-26px_rgba(15,23,42,0.25)]">
              <div className="space-y-3">
                <span className="block h-2 w-14 rounded-full bg-zinc-200" />
                <span className="block h-2 w-20 rounded-full bg-zinc-200" />
              </div>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
