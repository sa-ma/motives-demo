import * as React from "react";

import { cn } from "@/lib/utils";

function Conversation({
  className,
  ...props
}: React.ComponentProps<"div">) {
  return (
    <div
      className={cn("flex min-h-0 flex-1 flex-col overflow-hidden", className)}
      {...props}
    />
  );
}

function ConversationContent({
  className,
  ...props
}: React.ComponentProps<"div">) {
  return (
    <div
      className={cn("flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-5 py-5", className)}
      {...props}
    />
  );
}

export { Conversation, ConversationContent };
