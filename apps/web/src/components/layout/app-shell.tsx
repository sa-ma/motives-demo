"use client";

import { Menu } from "lucide-react";

import { AppSidebarContent } from "@/components/layout/app-sidebar";
import { buttonVariants } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";

export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen bg-white">
      <aside className="hidden h-screen w-[278px] shrink-0 border-r border-zinc-200/80 bg-zinc-50/70 lg:sticky lg:top-0 lg:block">
        <AppSidebarContent />
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center justify-between border-b border-zinc-200/80 bg-white px-4 py-3 lg:hidden">
          <div>
            <p className="text-[13px] font-semibold text-slate-950">
              Researcher AI
            </p>
            <p className="text-[13px] text-zinc-500">Study workspace</p>
          </div>

          <Sheet>
            <SheetTrigger
              className={buttonVariants({
                variant: "outline",
                size: "icon-lg",
                className:
                  "rounded-md border-zinc-200 bg-white text-zinc-700 shadow-none",
              })}
            >
              <Menu className="size-5" />
              <span className="sr-only">Open navigation</span>
            </SheetTrigger>
            <SheetContent side="left" className="p-0">
              <SheetHeader className="sr-only">
                <SheetTitle>Navigation</SheetTitle>
                <SheetDescription>Primary workspace navigation</SheetDescription>
              </SheetHeader>
              <AppSidebarContent />
            </SheetContent>
          </Sheet>
        </header>

        <main className="flex-1">{children}</main>
      </div>
    </div>
  );
}
