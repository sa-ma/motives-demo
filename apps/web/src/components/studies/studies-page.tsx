"use client";

import { useQuery } from "@tanstack/react-query";

import { StudiesEmptyState } from "@/components/studies/studies-empty-state";
import { StudySummaryCard } from "@/components/studies/study-summary-card";
import { StudiesToolbar } from "@/components/studies/studies-toolbar";
import { browserApiClient } from "@/lib/api/client";

export function StudiesPage() {
  const studiesQuery = useQuery({
    queryKey: ["studies"],
    queryFn: () => browserApiClient.studies.list(),
  });
  const studies = studiesQuery.data ?? [];

  return (
    <div className="min-h-full bg-[linear-gradient(180deg,rgba(255,255,255,0.96),rgba(250,250,253,0.98))]">
      <div className="flex h-full w-full flex-col gap-7 px-4 py-7 sm:px-6 lg:px-6 lg:py-9 xl:px-8 2xl:px-12">
        <StudiesToolbar />

        {studiesQuery.isPending ? (
          <section className="rounded-3xl border border-zinc-200/80 bg-white/90 px-6 py-10 text-center text-sm text-zinc-500 shadow-[0_24px_80px_-36px_rgba(15,23,42,0.16)]">
            Loading studies...
          </section>
        ) : studiesQuery.isError ? (
          <section className="rounded-3xl border border-rose-100 bg-rose-50 px-6 py-10 text-center text-sm text-rose-700">
            We couldn&apos;t load studies right now.
          </section>
        ) : studies.length === 0 ? (
          <StudiesEmptyState />
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
