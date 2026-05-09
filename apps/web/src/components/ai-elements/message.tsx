import * as React from "react";

import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";

type MessageProps = React.ComponentProps<"div"> & {
  from: "assistant" | "user";
};

function Message({ className, from, children, ...props }: MessageProps) {
  return (
    <div
      className={cn(
        "flex w-full items-end gap-3",
        from === "user" ? "justify-end" : "justify-start",
        className,
      )}
      {...props}
    >
      {from === "assistant" ? (
        <Avatar className="size-8 shrink-0 border border-primary/10 bg-primary/5">
          <AvatarFallback className="bg-transparent text-[11px] font-semibold text-primary">
            AI
          </AvatarFallback>
        </Avatar>
      ) : null}

      {children}

      {from === "user" ? (
        <Avatar className="size-8 shrink-0 border border-zinc-200 bg-zinc-50">
          <AvatarFallback className="bg-transparent text-[11px] font-semibold text-zinc-700">
            You
          </AvatarFallback>
        </Avatar>
      ) : null}
    </div>
  );
}

function MessageContent({
  className,
  ...props
}: React.ComponentProps<"div">) {
  return (
    <div
      className={cn(
        "max-w-[min(38rem,100%)] rounded-[20px] border border-zinc-200/80 bg-white px-4 py-3 shadow-[0_20px_50px_-34px_rgba(15,23,42,0.24)]",
        className,
      )}
      {...props}
    />
  );
}

function MessageResponse({
  className,
  ...props
}: React.ComponentProps<"div">) {
  return (
    <div
      className={cn(
        "whitespace-pre-wrap text-[14px] leading-7 text-zinc-700 sm:text-[14.5px]",
        className,
      )}
      {...props}
    />
  );
}

export { Message, MessageContent, MessageResponse };
