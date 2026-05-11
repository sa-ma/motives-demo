"use client";

import { useQuery } from "@tanstack/react-query";
import { useDeferredValue, useState } from "react";

import type {
  ListStudiesQuery,
  StudyListSort,
  StudyListStatusFilter,
  StudySummary,
} from "@motives-ai/contracts";

import { StudiesEmptyState } from "@/components/studies/studies-empty-state";
import { StudySummaryCard } from "@/components/studies/study-summary-card";
import {
  StudiesToolbar,
  type StudiesToolbarTab,
} from "@/components/studies/studies-toolbar";
import { browserApiClient } from "@/lib/api/client";
import { SERVER_RENDERED_QUERY_STALE_TIME_MS } from "@/lib/query";

const defaultStudiesSort: StudyListSort = "updated-desc";

function mapSelectedTabToStatus(tab: StudiesToolbarTab): StudyListStatusFilter | undefined {
  switch (tab) {
    case "Active":
      return "active";
    case "Completed":
      return "completed";
    case "Planning":
      return "planning";
    default:
      return undefined;
  }
}

export function StudiesPage({
  initialStudies,
}: {
  initialStudies?: StudySummary[] | null;
}) {
  const [searchValue, setSearchValue] = useState("");
  const [selectedTab, setSelectedTab] = useState<StudiesToolbarTab>("All Studies");
  const [sort, setSort] = useState<StudyListSort>(defaultStudiesSort);
  const deferredSearchValue = useDeferredValue(searchValue);
  const listQuery: ListStudiesQuery = {
    q: deferredSearchValue.trim() || undefined,
    sort,
    status: mapSelectedTabToStatus(selectedTab),
  };
  const isDefaultQuery =
    selectedTab === "All Studies" &&
    deferredSearchValue.trim().length === 0 &&
    sort === defaultStudiesSort;
  const studiesQuery = useQuery({
    initialData:
      isDefaultQuery && initialStudies ? initialStudies : undefined,
    placeholderData: (previousData) => previousData,
    queryKey: ["studies", listQuery],
    queryFn: () => browserApiClient.studies.list(listQuery),
    staleTime: SERVER_RENDERED_QUERY_STALE_TIME_MS,
  });
  const studies = studiesQuery.data ?? [];
  const hasActiveFilters =
    selectedTab !== "All Studies" ||
    searchValue.trim().length > 0 ||
    sort !== defaultStudiesSort;

  return (
    <div className="min-h-full bg-[linear-gradient(180deg,rgba(255,255,255,0.96),rgba(250,250,253,0.98))]">
      <div className="flex h-full w-full flex-col gap-7 px-4 py-7 sm:px-6 lg:px-6 lg:py-9 xl:px-8 2xl:px-12">
        <StudiesToolbar
          searchValue={searchValue}
          selectedTab={selectedTab}
          sort={sort}
          onSearchValueChange={setSearchValue}
          onSelectedTabChange={setSelectedTab}
          onSortChange={setSort}
        />

        {studiesQuery.isPending ? (
          <section className="rounded-3xl border border-zinc-200/80 bg-white/90 px-6 py-10 text-center text-sm text-zinc-500 shadow-[0_24px_80px_-36px_rgba(15,23,42,0.16)]">
            Loading studies...
          </section>
        ) : studiesQuery.isError ? (
          <section className="rounded-3xl border border-rose-100 bg-rose-50 px-6 py-10 text-center text-sm text-rose-700">
            We couldn&apos;t load studies right now.
          </section>
        ) : studies.length === 0 ? (
          <StudiesEmptyState
            title={hasActiveFilters ? "No matching studies" : undefined}
            description={
              hasActiveFilters
                ? "Try a different search, switch tabs, or reset the sort to see more studies."
                : undefined
            }
            onClearFilters={
              hasActiveFilters
                ? () => {
                    setSearchValue("");
                    setSelectedTab("All Studies");
                    setSort(defaultStudiesSort);
                  }
                : undefined
            }
          />
        ) : (
          <section className="grid gap-6 xl:grid-cols-2">
            {studies.map((study) => (
              <StudySummaryCard key={study.id} study={study} />
            ))}
          </section>
        )}
      </div>
    </div>
  );
}
