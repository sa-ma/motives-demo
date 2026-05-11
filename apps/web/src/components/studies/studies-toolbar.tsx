"use client";

import Link from "next/link";
import { ArrowDown, Plus, Search } from "lucide-react";

import type { StudyListSort } from "@motives-ai/contracts";

import { buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

export const studyToolbarTabs = [
  "All Studies",
  "Active",
  "Completed",
  "Planning",
] as const;

export type StudiesToolbarTab = (typeof studyToolbarTabs)[number];

type StudiesToolbarProps = {
  searchValue: string;
  selectedTab: StudiesToolbarTab;
  sort: StudyListSort;
  onSearchValueChange: (value: string) => void;
  onSelectedTabChange: (tab: StudiesToolbarTab) => void;
  onSortChange: (sort: StudyListSort) => void;
};

export function StudiesToolbar({
  onSearchValueChange,
  onSelectedTabChange,
  onSortChange,
  searchValue,
  selectedTab,
  sort,
}: StudiesToolbarProps) {
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="space-y-1.5">
          <h1 className="font-heading text-[1.7rem] leading-none font-semibold tracking-tight text-zinc-950 md:text-[2.1rem]">
            Studies
          </h1>
          <p className="text-[15px] leading-7 text-zinc-500">
            Manage and review AI-led research interviews.
          </p>
        </div>

        <Link
          href="/studies/new"
          className={buttonVariants({
            size: "lg",
            className:
              "rounded-xl bg-primary px-4 text-white shadow-[0_18px_40px_-24px_rgba(29,78,216,0.6)] hover:bg-primary/90",
          })}
        >
          <Plus className="size-4" />
          New Study
        </Link>
      </div>

      <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
        <nav className="flex flex-wrap gap-2">
          {studyToolbarTabs.map((tab) => {
            const isActive = tab === selectedTab;

            return (
              <button
                key={tab}
                type="button"
                onClick={() => onSelectedTabChange(tab)}
                className={cn(
                  "rounded-full px-4 py-2 text-sm font-medium transition-colors",
                  isActive
                    ? "bg-primary/8 text-primary shadow-[inset_0_1px_0_rgba(255,255,255,0.8)]"
                    : "text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900",
                )}
              >
                {tab}
              </button>
            );
          })}
        </nav>

        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="relative min-w-0 flex-1 sm:w-[320px]">
            <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-zinc-400" />
            <Input
              aria-label="Search studies"
              placeholder="Search studies..."
              className="h-10 rounded-xl border-zinc-200/80 bg-white pl-9 shadow-none"
              value={searchValue}
              onChange={(event) => onSearchValueChange(event.target.value)}
            />
          </div>

          <button
            type="button"
            aria-label={`Sort studies by last updated ${
              sort === "updated-desc" ? "oldest first" : "latest first"
            }`}
            onClick={() =>
              onSortChange(sort === "updated-desc" ? "updated-asc" : "updated-desc")
            }
            className="inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-zinc-200/80 bg-white px-3.5 text-sm font-medium text-zinc-700 shadow-[0_1px_2px_rgba(15,23,42,0.04)] transition-colors hover:bg-zinc-50"
          >
            <span>Last updated</span>
            <ArrowDown
              className={cn(
                "size-4 text-zinc-400 transition-transform",
                sort === "updated-desc" ? "rotate-0" : "rotate-180",
              )}
            />
          </button>
        </div>
      </div>
    </div>
  );
}
