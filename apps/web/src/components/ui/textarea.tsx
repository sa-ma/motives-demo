import * as React from "react";

import { cn } from "@/lib/utils";

const Textarea = React.forwardRef<
  HTMLTextAreaElement,
  React.ComponentProps<"textarea">
>(({ className, ...props }, ref) => {
  return (
    <textarea
      ref={ref}
      data-slot="textarea"
      className={cn(
        "flex min-h-16 w-full rounded-md border border-zinc-200 bg-white px-3 py-2 text-sm leading-6 text-zinc-900 shadow-[0_1px_2px_rgba(15,23,42,0.04)] outline-none transition-[border-color,box-shadow] placeholder:text-zinc-400 focus-visible:border-primary/40 focus-visible:ring-4 focus-visible:ring-primary/10 disabled:cursor-not-allowed disabled:opacity-50",
        className,
      )}
      {...props}
    />
  );
});

Textarea.displayName = "Textarea";

export { Textarea };
