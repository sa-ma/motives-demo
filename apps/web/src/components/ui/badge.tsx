import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center justify-center rounded-md border px-3 py-1.5 text-xs font-medium transition-colors",
  {
    variants: {
      variant: {
        default:
          "border-primary/15 bg-primary/8 text-primary shadow-[inset_0_1px_0_rgba(255,255,255,0.7)]",
        secondary: "border-zinc-200 bg-zinc-50 text-zinc-700",
        outline: "border-zinc-200 bg-white text-zinc-700",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  },
);

function Badge({
  className,
  variant,
  ...props
}: React.ComponentProps<"span"> & VariantProps<typeof badgeVariants>) {
  return (
    <span
      data-slot="badge"
      className={cn(badgeVariants({ variant }), className)}
      {...props}
    />
  );
}

export { Badge, badgeVariants };
