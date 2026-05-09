"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { BookOpenText } from "lucide-react";

import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";

type NavMatch = "exact" | "prefix";

type NavItem = {
  label: string;
  href?: string;
  icon: React.ComponentType<{ className?: string }>;
  match?: NavMatch;
};

const mainNavItems: readonly NavItem[] = [
  {
    label: "Studies",
    href: "/studies",
    icon: BookOpenText,
    match: "prefix",
  },
] as const;

function isActivePath(
  pathname: string,
  href: string | undefined,
  match: NavMatch = "exact",
) {
  if (!href) {
    return false;
  }

  if (match === "exact") {
    return pathname === href;
  }

  if (href === "/") {
    return pathname === href;
  }

  return pathname === href || pathname.startsWith(`${href}/`);
}

function getNavItemActiveState(pathname: string, item: NavItem) {
  if (item.href === "/studies" && pathname === "/studies/new") {
    return false;
  }

  return isActivePath(pathname, item.href, item.match);
}

function SidebarItem({
  label,
  href,
  icon: Icon,
  active = false,
  compact = false,
}: {
  label: string;
  href?: string;
  icon: React.ComponentType<{ className?: string }>;
  active?: boolean;
  compact?: boolean;
}) {
  const classes = cn(
    "flex h-9 items-center rounded-md text-sm font-medium transition-colors",
    compact ? "justify-center px-0 2xl:justify-start 2xl:gap-2.5 2xl:px-2.5" : "gap-2.5 px-2.5",
    active
      ? "bg-primary/5 text-primary"
      : "text-zinc-600 hover:bg-zinc-100/80 hover:text-zinc-950",
  );

  const content = (
    <>
      <Icon className={cn("size-4", active ? "text-primary" : "text-zinc-500")} />
      <span className={cn(compact && "hidden 2xl:inline")}>{label}</span>
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

export function AppSidebarContent({ compact = false }: { compact?: boolean }) {
  const pathname = usePathname();

  return (
    <div className={cn("flex h-full flex-col bg-white py-6", compact ? "px-3 2xl:px-4" : "px-4")}>
      <div className={cn("flex items-center", compact ? "justify-center 2xl:justify-start" : "justify-start")}>
        <p className={cn("text-[15px] font-semibold text-slate-950", compact ? "hidden 2xl:block" : "block")}>
          Researcher AI
        </p>
        <div className={cn("flex size-10 items-center justify-center rounded-full bg-primary text-sm font-semibold text-primary-foreground", compact ? "2xl:hidden" : "hidden")}>
          R
        </div>
      </div>

      <Separator className="mt-6 mb-7" />

      <nav className="space-y-1">
        {mainNavItems.map((item) => (
          <SidebarItem
            key={item.label}
            {...item}
            active={getNavItemActiveState(pathname, item)}
            compact={compact}
          />
        ))}
      </nav>

      <button
        type="button"
        className={cn(
          "mt-auto inline-flex size-11 items-center justify-center rounded-full transition-colors hover:bg-zinc-100",
          compact ? "self-center 2xl:self-auto" : "self-auto",
        )}
        aria-label="Open user menu"
      >
        <Avatar className="size-11">
          <AvatarFallback>SC</AvatarFallback>
        </Avatar>
      </button>
    </div>
  );
}
