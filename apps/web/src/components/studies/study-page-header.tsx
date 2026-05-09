import Link from "next/link";
import { ArrowLeft, Ellipsis, FilePlus2 } from "lucide-react";

import { Button } from "@/components/ui/button";

export function StudyPageHeader() {
  return (
    <div className="flex flex-col gap-5">
      <Link
        href="/studies"
        className="inline-flex w-fit items-center gap-2 text-sm font-medium text-zinc-600 transition-colors hover:text-zinc-950"
      >
        <ArrowLeft className="size-4" />
        Back to Studies
      </Link>

      <div className="flex flex-col gap-5 md:flex-row md:items-start md:justify-between">
        <div className="max-w-2xl space-y-1.5">
          <h1 className="font-heading text-[1.65rem] leading-none font-semibold tracking-tight text-zinc-950 md:text-[2rem]">
            New Study
          </h1>
          <p className="max-w-2xl text-[15px] leading-7 text-zinc-500 md:text-[15px]">
            Create a new research study and generate your interview plan
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <Button
            type="button"
            variant="outline"
            size="default"
            className="rounded-md border-zinc-200 bg-white text-sm font-medium text-zinc-800 shadow-none hover:bg-zinc-50"
          >
            <FilePlus2 className="size-4" />
            Use Template
          </Button>
          <Button
            type="button"
            variant="outline"
            size="icon"
            className="rounded-md border-zinc-200 bg-white text-zinc-700 shadow-none hover:bg-zinc-50"
            aria-label="More actions"
          >
            <Ellipsis className="size-5" />
          </Button>
        </div>
      </div>
    </div>
  );
}
