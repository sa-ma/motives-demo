"use client";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type DurationSelectorProps = {
  options: string[];
  value: string;
  onChange: (value: string) => void;
};

export function DurationSelector({
  options,
  value,
  onChange,
}: DurationSelectorProps) {
  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-5">
      {options.map((option) => {
        const active = option === value;

        return (
          <Button
            key={option}
            type="button"
            variant="outline"
            size="lg"
            onClick={() => onChange(option)}
            className={cn(
              "w-full rounded-md border-zinc-200 bg-white px-3 text-sm font-medium text-zinc-700 shadow-none hover:bg-zinc-50",
              active
                ? "border-primary/45 bg-primary/5 text-primary hover:bg-primary/5"
                : "hover:border-zinc-300",
            )}
            aria-pressed={active}
          >
            {option}
          </Button>
        );
      })}
    </div>
  );
}
