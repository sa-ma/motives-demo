import * as React from "react";

import { cn } from "@/lib/utils";

type FieldLayoutProps = {
  id: string;
  label: string;
  count: number;
  maxLength: number;
  children: React.ReactNode;
  className?: string;
  useLabel?: boolean;
};

function FieldLayout({
  id,
  label,
  count,
  maxLength,
  children,
  className,
  useLabel = true,
}: FieldLayoutProps) {
  return (
    <div className={cn("space-y-1.5", className)}>
      {useLabel ? (
        <label
          htmlFor={id}
          className="block text-[12px] font-semibold text-black"
        >
          {label}
        </label>
      ) : (
        <p
          id={`${id}-label`}
          className="block text-[12px] font-semibold text-black"
        >
          {label}
        </p>
      )}
      {children}
        <p className="text-right text-[12px] text-zinc-400">
          {count}/{maxLength}
        </p>
    </div>
  );
}

export { FieldLayout };
