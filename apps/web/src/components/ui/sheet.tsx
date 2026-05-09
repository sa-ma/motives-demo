"use client";

import * as React from "react";
import { Dialog } from "@base-ui/react/dialog";
import { X } from "lucide-react";

import { cn } from "@/lib/utils";

function Sheet({
  children,
  ...props
}: React.ComponentProps<typeof Dialog.Root>) {
  return <Dialog.Root {...props}>{children}</Dialog.Root>;
}

function SheetTrigger({
  className,
  ...props
}: React.ComponentProps<typeof Dialog.Trigger>) {
  return <Dialog.Trigger className={className} {...props} />;
}

function SheetPortal({
  children,
  ...props
}: React.ComponentProps<typeof Dialog.Portal>) {
  return <Dialog.Portal {...props}>{children}</Dialog.Portal>;
}

function SheetClose({
  className,
  ...props
}: React.ComponentProps<typeof Dialog.Close>) {
  return <Dialog.Close className={className} {...props} />;
}

function SheetOverlay({
  className,
  ...props
}: React.ComponentProps<typeof Dialog.Backdrop>) {
  return (
    <Dialog.Backdrop
      className={cn(
        "fixed inset-0 z-40 bg-zinc-950/40 backdrop-blur-[2px] transition-opacity duration-200",
        className,
      )}
      {...props}
    />
  );
}

function SheetContent({
  className,
  children,
  side = "left",
  showClose = true,
  ...props
}: React.ComponentProps<typeof Dialog.Popup> & {
  side?: "left" | "right";
  showClose?: boolean;
}) {
  return (
    <SheetPortal>
      <SheetOverlay />
      <Dialog.Popup
        className={cn(
          "fixed top-0 z-50 flex h-dvh w-[min(22rem,88vw)] flex-col border-zinc-200 bg-white shadow-[0_30px_70px_-28px_rgba(15,23,42,0.35)] outline-none duration-200",
          side === "left"
            ? "left-0 rounded-r-[28px] border-r"
            : "right-0 rounded-l-[28px] border-l",
          className,
        )}
        {...props}
      >
        {showClose ? (
          <SheetClose className="absolute top-5 right-5 inline-flex size-9 items-center justify-center rounded-full border border-zinc-200 bg-white text-zinc-500 transition-colors hover:text-zinc-900 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-primary/10">
            <X className="size-4" />
            <span className="sr-only">Close</span>
          </SheetClose>
        ) : null}
        {children}
      </Dialog.Popup>
    </SheetPortal>
  );
}

function SheetHeader({ className, ...props }: React.ComponentProps<"div">) {
  return <div className={cn("flex flex-col gap-1.5", className)} {...props} />;
}

function SheetTitle({
  className,
  ...props
}: React.ComponentProps<typeof Dialog.Title>) {
  return (
    <Dialog.Title
      className={cn("text-lg font-semibold tracking-tight text-zinc-950", className)}
      {...props}
    />
  );
}

function SheetDescription({
  className,
  ...props
}: React.ComponentProps<typeof Dialog.Description>) {
  return (
    <Dialog.Description
      className={cn("text-sm leading-6 text-zinc-500", className)}
      {...props}
    />
  );
}

export {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetOverlay,
  SheetPortal,
  SheetTitle,
  SheetTrigger,
};
