import * as React from "react";

import { cn } from "@/lib/utils";

function Avatar({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="avatar"
      className={cn(
        "relative flex size-11 shrink-0 items-center justify-center overflow-hidden rounded-full bg-zinc-950 text-white",
        className,
      )}
      {...props}
    />
  );
}

const AvatarImage = React.forwardRef<
  HTMLImageElement,
  React.ComponentProps<"img">
>(({ className, alt = "", ...props }, ref) => {
  return (
    <>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        ref={ref}
        alt={alt}
        className={cn("size-full object-cover", className)}
        {...props}
      />
    </>
  );
});

AvatarImage.displayName = "AvatarImage";

function AvatarFallback({
  className,
  ...props
}: React.ComponentProps<"span">) {
  return (
    <span
      data-slot="avatar-fallback"
      className={cn(
        "flex size-full items-center justify-center bg-slate-950 text-sm font-semibold tracking-tight text-white",
        className,
      )}
      {...props}
    />
  );
}

export { Avatar, AvatarFallback, AvatarImage };
