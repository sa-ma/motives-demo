"use client";

import * as React from "react";
import { Select as SelectPrimitive } from "@base-ui/react/select";
import { Check, ChevronDown } from "lucide-react";

import { cn } from "@/lib/utils";

function Select({
  children,
  ...props
}: React.ComponentProps<typeof SelectPrimitive.Root>) {
  return <SelectPrimitive.Root {...props}>{children}</SelectPrimitive.Root>;
}

function SelectTrigger({
  className,
  children,
  ...props
}: React.ComponentProps<typeof SelectPrimitive.Trigger>) {
  return (
    <SelectPrimitive.Trigger
      className={cn(
        "flex h-11 w-full items-center justify-between rounded-xl border border-zinc-200 bg-white px-4 text-sm text-zinc-900 shadow-[0_1px_2px_rgba(15,23,42,0.04)] outline-none transition-[border-color,box-shadow] focus-visible:border-primary/40 focus-visible:ring-4 focus-visible:ring-primary/10 disabled:cursor-not-allowed disabled:opacity-50",
        className,
      )}
      {...props}
    >
      {children}
      <SelectPrimitive.Icon className="text-zinc-400">
        <ChevronDown className="size-4" />
      </SelectPrimitive.Icon>
    </SelectPrimitive.Trigger>
  );
}

function SelectValue({
  className,
  ...props
}: React.ComponentProps<typeof SelectPrimitive.Value>) {
  return (
    <SelectPrimitive.Value
      className={cn("truncate text-left", className)}
      {...props}
    />
  );
}

function SelectContent({
  className,
  children,
  sideOffset = 8,
  portalled = true,
  ...props
}: React.ComponentProps<typeof SelectPrimitive.Positioner> & {
  children: React.ReactNode;
  portalled?: boolean;
}) {
  const content = (
    <>
      <SelectPrimitive.Positioner sideOffset={sideOffset} {...props}>
        <SelectPrimitive.Popup
          className={cn(
            "z-50 min-w-[var(--anchor-width)] overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-[0_24px_60px_-24px_rgba(15,23,42,0.28)] outline-none",
            className,
          )}
        >
          <SelectPrimitive.List className="max-h-64 overflow-y-auto p-1.5">
            {children}
          </SelectPrimitive.List>
        </SelectPrimitive.Popup>
      </SelectPrimitive.Positioner>
    </>
  );

  if (!portalled) {
    return content;
  }

  return <SelectPrimitive.Portal>{content}</SelectPrimitive.Portal>;
}

function SelectItem({
  className,
  children,
  ...props
}: React.ComponentProps<typeof SelectPrimitive.Item>) {
  return (
    <SelectPrimitive.Item
      className={cn(
        "grid cursor-default grid-cols-[1fr_auto] items-center gap-3 rounded-lg px-3 py-2 text-sm text-zinc-700 outline-none transition-colors data-[highlighted]:bg-zinc-50 data-[highlighted]:text-zinc-950 data-[selected]:text-zinc-950",
        className,
      )}
      {...props}
    >
      <SelectPrimitive.ItemText>{children}</SelectPrimitive.ItemText>
      <SelectPrimitive.ItemIndicator className="text-primary">
        <Check className="size-4" />
      </SelectPrimitive.ItemIndicator>
    </SelectPrimitive.Item>
  );
}

export { Select, SelectContent, SelectItem, SelectTrigger, SelectValue };
