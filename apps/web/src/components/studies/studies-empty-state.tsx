import Link from "next/link";
import { FilePlus2, SearchX } from "lucide-react";

import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

type StudiesEmptyStateProps = {
  description?: string;
  onClearFilters?: () => void;
  title?: string;
};

export function StudiesEmptyState({
  description = "Start your first AI-led research study to generate an interview plan and begin collecting insights.",
  onClearFilters,
  title = "No studies yet",
}: StudiesEmptyStateProps) {
  return (
    <Card className="rounded-[2rem] border-zinc-200/80 bg-[linear-gradient(180deg,rgba(255,255,255,0.98),rgba(248,250,255,0.98))] shadow-[0_32px_90px_-44px_rgba(15,23,42,0.24)]">
      <CardContent className="flex flex-col items-center gap-6 px-6 py-20 text-center sm:px-10 sm:py-24">
        <div className="flex size-18 items-center justify-center rounded-[1.75rem] bg-[linear-gradient(180deg,rgba(59,130,246,0.14),rgba(96,165,250,0.06))] text-blue-700 shadow-[inset_0_1px_0_rgba(255,255,255,0.65)]">
          <SearchX className="size-8" />
        </div>

        <div className="max-w-lg space-y-3">
          <h2 className="font-heading text-[1.65rem] leading-tight font-semibold tracking-tight text-zinc-950">
            {title}
          </h2>
          <p className="text-[15px] leading-7 text-zinc-500 sm:text-[16px]">
            {description}
          </p>
        </div>

        {onClearFilters ? (
          <button
            type="button"
            onClick={onClearFilters}
            className={buttonVariants({
              size: "lg",
              className:
                "rounded-xl border border-zinc-200 bg-white px-4 text-zinc-900 shadow-[0_18px_40px_-24px_rgba(15,23,42,0.18)] hover:bg-zinc-50",
            })}
          >
            Clear filters
          </button>
        ) : (
          <Link
            href="/studies/new"
            className={buttonVariants({
              size: "lg",
              className:
                "rounded-xl bg-primary px-4 text-primary-foreground shadow-[0_18px_40px_-24px_rgba(29,78,216,0.6)] hover:bg-primary/90",
            })}
          >
            <FilePlus2 className="size-4" />
            New Study
          </Link>
        )}
      </CardContent>
    </Card>
  );
}
