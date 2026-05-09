import Link from "next/link";
import {
  BookOpenText,
  ChevronDown,
  FilePlus2,
  FileText,
  Lightbulb,
  UsersRound,
  Settings,
  Sparkles,
} from "lucide-react";

import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";

const mainNavItems = [
  {
    label: "New Study",
    href: "/studies/new",
    icon: FilePlus2,
    active: true,
  },
  {
    label: "Studies",
    icon: BookOpenText,
  },
  {
    label: "Participants",
    icon: UsersRound,
  },
  {
    label: "Templates",
    icon: FileText,
  },
  {
    label: "Insights",
    icon: Lightbulb,
  },
] as const;

const settingsItems = [
  {
    label: "Settings",
    icon: Settings,
  },
] as const;

function SidebarItem({
  label,
  href,
  icon: Icon,
  active = false,
}: {
  label: string;
  href?: string;
  icon: React.ComponentType<{ className?: string }>;
  active?: boolean;
}) {
  const classes = cn(
    "flex h-9 items-center gap-2.5 rounded-md px-2.5 text-sm font-medium transition-colors",
    active
      ? "bg-primary/5 text-primary"
      : "text-zinc-600 hover:bg-zinc-100/80 hover:text-zinc-950",
  );

  const content = (
    <>
      <Icon className={cn("size-4", active ? "text-primary" : "text-zinc-500")} />
      <span>{label}</span>
    </>
  );

  if (href) {
    return (
      <Link href={href} className={classes}>
        {content}
      </Link>
    );
  }

  return (
    <div className={cn(classes, "cursor-default")} aria-disabled="true">
      {content}
    </div>
  );
}

export function AppSidebarContent() {
  return (
    <div className="flex h-full flex-col bg-white px-5 py-6">
      <div className="flex items-center">
        <p className="text-[15px] font-semibold text-slate-950">
          Researcher AI
        </p>
      </div>

      <Separator className="mt-6 mb-7" />

      <div className="space-y-8">
        <section className="space-y-2.5">
          <p className="px-1 text-[11px] font-semibold tracking-[0.14em] text-zinc-400 uppercase">
            Main
          </p>
          <nav className="space-y-1">
            {mainNavItems.map((item) => (
              <SidebarItem key={item.label} {...item} />
            ))}
          </nav>
        </section>

        <section className="space-y-2.5">
          <p className="px-1 text-[11px] font-semibold tracking-[0.14em] text-zinc-400 uppercase">
            Settings
          </p>
          <nav className="space-y-1">
            {settingsItems.map((item) => (
              <SidebarItem key={item.label} {...item} />
            ))}
          </nav>
        </section>
      </div>

      <div className="mt-auto rounded-md border border-zinc-200 bg-white px-3 py-3 shadow-[0_18px_38px_-28px_rgba(15,23,42,0.32)]">
        <div className="flex items-center gap-3">
          <Avatar className="size-12">
            <AvatarFallback>SC</AvatarFallback>
          </Avatar>
          <div className="min-w-0 flex-1">
            <p className="truncate text-[13px] font-semibold text-zinc-950">Sarah Chen</p>
            <div className="flex items-center gap-1 text-[13px] text-zinc-500">
              <Sparkles className="size-3.5 text-primary" />
              <span>Researcher</span>
            </div>
          </div>
          <button
            type="button"
            className="inline-flex size-8 items-center justify-center rounded-full text-zinc-400 transition-colors hover:bg-zinc-100 hover:text-zinc-700"
            aria-label="Open user menu"
          >
            <ChevronDown className="size-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
