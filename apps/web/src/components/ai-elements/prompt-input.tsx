import * as React from "react";
import { ArrowUp } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

function PromptInput({
  className,
  ...props
}: React.ComponentProps<"form">) {
  return (
    <form
      className={cn(
        "bg-white px-0 py-0 sm:rounded-[22px] sm:border sm:border-zinc-200/80 sm:p-3 sm:shadow-[0_24px_64px_-40px_rgba(15,23,42,0.2)]",
        className,
      )}
      {...props}
    />
  );
}

function PromptInputTextarea({
  className,
  ...props
}: React.ComponentProps<typeof Textarea>) {
  return (
    <Textarea
      className={cn(
        "min-h-24 resize-none border-0 bg-transparent px-1 py-1.5 shadow-none focus-visible:ring-0",
        className,
      )}
      {...props}
    />
  );
}

function PromptInputSubmit({
  className,
  children,
  ...props
}: React.ComponentProps<typeof Button>) {
  return (
    <Button
      size="icon-lg"
      className={cn(
        "rounded-full shadow-[0_20px_40px_-24px_rgba(29,78,216,0.55)]",
        className,
      )}
      {...props}
    >
      {children ?? <ArrowUp className="size-4" />}
    </Button>
  );
}

export { PromptInput, PromptInputSubmit, PromptInputTextarea };
