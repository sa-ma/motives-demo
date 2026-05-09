import { AiAssistPanel } from "@/components/studies/ai-assist-panel";
import { StudyForm } from "@/components/studies/study-form";
import { StudyPageHeader } from "@/components/studies/study-page-header";

export function NewStudyPage() {
  return (
    <div className="h-full bg-[linear-gradient(180deg,rgba(255,255,255,0.96),rgba(250,250,253,0.98))]">
      <div className="mx-auto flex h-full max-w-[1180px] flex-col gap-8 px-4 py-7 sm:px-6 lg:px-8 lg:py-9 xl:px-10">
        <StudyPageHeader />

        <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_320px]">
          <section className="min-w-0">
            <StudyForm />
          </section>

          <aside className="min-w-0 xl:sticky xl:top-10 xl:self-start">
            <AiAssistPanel />
          </aside>
        </div>
      </div>
    </div>
  );
}
