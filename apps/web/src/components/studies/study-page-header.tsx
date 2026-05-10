import Link from "next/link";
import { ArrowLeft} from "lucide-react";

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

      </div>
    </div>
  );
}
