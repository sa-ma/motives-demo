"use client";

import * as React from "react";
import { Menu as MenuPrimitive } from "@base-ui/react/menu";

import { cn } from "@/lib/utils";

function DropdownMenu({
  children,
  ...props
}: React.ComponentProps<typeof MenuPrimitive.Root>) {
  return <MenuPrimitive.Root {...props}>{children}</MenuPrimitive.Root>;
}

function DropdownMenuTrigger({
  className,
  ...props
}: React.ComponentProps<typeof MenuPrimitive.Trigger>) {
  return <MenuPrimitive.Trigger className={className} {...props} />;
}

function DropdownMenuContent({
  align = "end",
  children,
  className,
  portalled = true,
  sideOffset = 8,
  ...props
}: React.ComponentProps<typeof MenuPrimitive.Positioner> & {
  children: React.ReactNode;
  portalled?: boolean;
}) {
  const content = (
    <MenuPrimitive.Positioner
      align={align}
      sideOffset={sideOffset}
      {...props}
    >
      <MenuPrimitive.Popup
        className={cn(
          "z-50 min-w-48 overflow-hidden rounded-xl border border-zinc-200 bg-white p-1.5 shadow-[0_24px_60px_-24px_rgba(15,23,42,0.28)] outline-none",
          className,
        )}
      >
        {children}
      </MenuPrimitive.Popup>
    </MenuPrimitive.Positioner>
  );

  if (!portalled) {
    return content;
  }

  return <MenuPrimitive.Portal>{content}</MenuPrimitive.Portal>;
}

function DropdownMenuGroup({
  className,
  ...props
}: React.ComponentProps<typeof MenuPrimitive.Group>) {
  return <MenuPrimitive.Group className={className} {...props} />;
}

function DropdownMenuLabel({
  className,
  ...props
}: React.ComponentProps<typeof MenuPrimitive.GroupLabel>) {
  return (
    <MenuPrimitive.GroupLabel
      className={cn(
        "px-2 py-1.5 text-[11px] font-semibold tracking-[0.08em] text-zinc-500 uppercase",
        className,
      )}
      {...props}
    />
  );
}

function DropdownMenuItem({
  className,
  ...props
}: React.ComponentProps<typeof MenuPrimitive.Item>) {
  return (
    <MenuPrimitive.Item
      className={cn(
        "grid cursor-default grid-cols-[1fr_auto] items-center gap-3 rounded-lg px-3 py-2 text-sm text-zinc-700 outline-none transition-colors data-[disabled]:cursor-not-allowed data-[disabled]:opacity-45 data-[highlighted]:bg-zinc-50 data-[highlighted]:text-zinc-950",
        className,
      )}
      {...props}
    />
  );
}

function DropdownMenuSeparator({
  className,
  ...props
}: React.ComponentProps<typeof MenuPrimitive.Separator>) {
  return (
    <MenuPrimitive.Separator
      className={cn("-mx-1 my-1 h-px bg-zinc-200", className)}
      {...props}
    />
  );
}

export {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
};
