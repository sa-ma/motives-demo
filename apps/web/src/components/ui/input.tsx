import * as React from "react";

import { cn } from "@/lib/utils";

const Input = React.forwardRef<HTMLInputElement, React.ComponentProps<"input">>(
  ({ className, type = "text", ...props }, ref) => {
    return (
      <input
        ref={ref}
        type={type}
        data-slot="input"
        className={cn(
          "flex h-9 w-full rounded-md border border-zinc-200 bg-white px-3 py-1 text-sm text-zinc-900 shadow-[0_1px_2px_rgba(15,23,42,0.04)] outline-none transition-[border-color,box-shadow] placeholder:text-zinc-400 focus-visible:border-primary/40 focus-visible:ring-4 focus-visible:ring-primary/10 disabled:cursor-not-allowed disabled:opacity-50",
          className,
        )}
        {...props}
      />
    );
  },
);

Input.displayName = "Input";

export { Input };
