"use client";

import { X } from "lucide-react";

import { Badge } from "@/components/ui/badge";

type TopicChipListProps = {
  topics: string[];
  onRemove: (topic: string) => void;
  emptyMessage?: string;
};

export function TopicChipList({
  topics,
  onRemove,
  emptyMessage = "Add at least one topic to generate the interview plan.",
}: TopicChipListProps) {
  return (
    <div className="flex min-h-16 flex-wrap content-start gap-1.5 rounded-md border border-zinc-200 bg-white px-3 py-2 shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
      {topics.length === 0 ? (
        <p className="self-center text-sm text-zinc-400">{emptyMessage}</p>
      ) : (
        topics.map((topic) => (
          <Badge key={topic} className="gap-1 rounded-md px-2 py-1 text-xs">
            <span>{topic}</span>
            <button
              type="button"
              onClick={() => onRemove(topic)}
              className="inline-flex size-3.5 items-center justify-center rounded-md text-primary/70 transition-colors hover:bg-primary/10 hover:text-primary"
              aria-label={`Remove ${topic}`}
            >
              <X className="size-2.5" />
            </button>
          </Badge>
        ))
      )}
    </div>
  );
}
