import { studies } from "@/components/studies/studies.mock";
import { StudiesEmptyState } from "@/components/studies/studies-empty-state";
import { StudySummaryCard } from "@/components/studies/study-summary-card";
import { StudiesToolbar } from "@/components/studies/studies-toolbar";

export function StudiesPage() {
  return (
    <div className="min-h-full bg-[linear-gradient(180deg,rgba(255,255,255,0.96),rgba(250,250,253,0.98))]">
      <div className="mx-auto flex h-full max-w-[1180px] flex-col gap-7 px-4 py-7 sm:px-6 lg:px-8 lg:py-9 xl:px-10">
        <StudiesToolbar />

        {studies.length === 0 ? (
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
