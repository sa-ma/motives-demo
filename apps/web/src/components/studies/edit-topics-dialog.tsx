"use client";

import { useState } from "react";
import type { LucideIcon } from "lucide-react";
import {
  Check,
  CircleOff,
  GripVertical,
  MessageSquareMore,
  PencilLine,
  Plus,
  RefreshCw,
  Smile,
  Trash2,
  X,
} from "lucide-react";

import type { EditableStudyPlanFields } from "@/components/studies/study-plan.types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";

type InterviewBehaviorOption = {
  id: EditableStudyPlanFields["selectedBehaviorId"];
  title: string;
  description: string;
  icon: LucideIcon;
};

const interviewerBehaviorOptions: readonly InterviewBehaviorOption[] = [
  {
    id: "probe-emotional-language",
    title: "Probe emotional language",
    description: "Dig deeper into emotions and feelings.",
    icon: MessageSquareMore,
  },
  {
    id: "ask-for-examples",
    title: "Ask for concrete examples",
    description: "Encourage specific stories and examples.",
    icon: PencilLine,
  },
  {
    id: "challenge-contradictions",
    title: "Challenge contradictions",
    description: "Clarify inconsistencies in responses.",
    icon: RefreshCw,
  },
  {
    id: "stay-neutral",
    title: "Stay neutral",
    description: "Maintain a neutral and unbiased tone.",
    icon: Smile,
  },
  {
    id: "avoid-leading-questions",
    title: "Avoid leading questions",
    description: "Keep questions open-ended and unbiased.",
    icon: CircleOff,
  },
] as const;

const interviewToneOptions = [
  "Conversational and empathetic",
  "Calm and structured",
  "Warm and curious",
  "Direct and efficient",
] as const;

type DraftField = "mustCoverAreas" | "thingsToAvoid";

type EditTopicsDialogProps = {
  open: boolean;
  plan: EditableStudyPlanFields;
  onOpenChange: (open: boolean) => void;
  onSave: (plan: EditableStudyPlanFields) => Promise<void> | void;
};

type TopicDraft = {
  id: string;
  value: string;
};

function createTopicDrafts(topics: string[]): TopicDraft[] {
  return topics.map((topic) => ({
    id: crypto.randomUUID(),
    value: topic,
  }));
}

function moveItem<T>(items: T[], fromIndex: number, toIndex: number) {
  const next = [...items];
  const [item] = next.splice(fromIndex, 1);
  next.splice(toIndex, 0, item);
  return next;
}

function DialogSection({
  title,
  description,
  action,
  children,
}: {
  title: string;
  description: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="border-t border-zinc-200/80 px-5 py-4 first:border-t-0 sm:px-6 sm:py-5">
      <div className="flex flex-col gap-2.5 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-1">
          <h3 className="text-[14px] font-semibold text-zinc-950">{title}</h3>
          <p className="text-[13px] leading-5 text-zinc-500">{description}</p>
        </div>
        {action ? <div className="self-end sm:self-auto">{action}</div> : null}
      </div>
      <div className="mt-3.5">{children}</div>
    </section>
  );
}

function TopicRow({
  topic,
  index,
  isDragging,
  onChange,
  onDelete,
  onDragStart,
  onDragOver,
  onDrop,
}: {
  topic: string;
  index: number;
  isDragging: boolean;
  onChange: (value: string) => void;
  onDelete: () => void;
  onDragStart: () => void;
  onDragOver: () => void;
  onDrop: () => void;
}) {
  return (
    <div
      draggable
      onDragStart={onDragStart}
      onDragOver={(event) => {
        event.preventDefault();
        onDragOver();
      }}
      onDrop={(event) => {
        event.preventDefault();
        onDrop();
      }}
      className={cn(
        "grid grid-cols-[auto_auto_minmax(0,1fr)_auto] items-center gap-3 border-t border-zinc-200/80 px-3 py-2 first:border-t-0",
        isDragging && "bg-zinc-50/80",
      )}
    >
      <button
        type="button"
        className="inline-flex size-7 cursor-grab items-center justify-center rounded-md text-zinc-400 transition-colors hover:bg-zinc-50 hover:text-zinc-600 active:cursor-grabbing"
        aria-label={`Reorder topic ${index + 1}`}
      >
        <GripVertical className="size-4" />
      </button>
      <span className="w-4 text-center text-sm font-medium text-zinc-500">
        {index + 1}.
      </span>
      <Input
        value={topic}
        onChange={(event) => onChange(event.target.value)}
        placeholder="New topic"
        className="h-8 border-0 bg-transparent px-0 py-0 text-[14px] shadow-none focus-visible:ring-0"
      />
      <button
        type="button"
        onClick={onDelete}
        className="inline-flex size-8 items-center justify-center rounded-md text-zinc-400 transition-colors hover:bg-zinc-50 hover:text-zinc-700"
        aria-label={`Delete topic ${index + 1}`}
      >
        <Trash2 className="size-4" />
      </button>
    </div>
  );
}

function EditableChip({
  label,
  onRemove,
}: {
  label: string;
  onRemove: () => void;
}) {
  return (
    <Badge className="gap-2 rounded-full border-primary/20 bg-primary/4 px-3 py-1 text-[12px] font-medium text-primary">
      <span>{label}</span>
      <button
        type="button"
        onClick={onRemove}
        className="inline-flex size-4 items-center justify-center rounded-full text-primary/70 transition-colors hover:bg-primary/10 hover:text-primary"
        aria-label={`Remove ${label}`}
      >
        <X className="size-3" />
      </button>
    </Badge>
  );
}

function AddChipControl({
  placeholder,
  buttonLabel,
  value,
  onValueChange,
  onSubmit,
  onCancel,
}: {
  placeholder: string;
  buttonLabel: string;
  value: string;
  onValueChange: (value: string) => void;
  onSubmit: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
      <Input
        value={value}
        onChange={(event) => onValueChange(event.target.value)}
        placeholder={placeholder}
        className="h-9 rounded-full px-4 text-[13px]"
      />
      <div className="flex items-center gap-2">
        <Button
          type="button"
          variant="outline"
          className="h-9 rounded-full border-zinc-200 px-3 text-[13px] text-zinc-600 hover:bg-zinc-50"
          onClick={onCancel}
        >
          Cancel
        </Button>
        <Button
          type="button"
          variant="outline"
          className="h-9 rounded-full border-primary/18 px-4 text-[13px] text-primary hover:bg-primary/5"
          onClick={onSubmit}
        >
          <Plus className="size-4" />
          {buttonLabel}
        </Button>
      </div>
    </div>
  );
}

function InterviewBehaviorCard({
  option,
  selected,
  onSelect,
}: {
  option: InterviewBehaviorOption;
  selected: boolean;
  onSelect: () => void;
}) {
  const Icon = option.icon;

  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        "relative flex min-h-[148px] flex-col items-center rounded-2xl border px-4 py-5 text-center transition-all",
        selected
          ? "border-primary/55 bg-primary/2 shadow-[0_18px_34px_-28px_rgba(29,78,216,0.42)]"
          : "border-zinc-200/80 bg-white hover:border-zinc-300 hover:bg-zinc-50/40",
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <Icon
          className={cn(
            "size-6",
            selected ? "text-primary" : "text-zinc-500",
          )}
        />
        {selected ? (
          <span className="absolute top-4 right-4 inline-flex size-5 items-center justify-center rounded-full bg-primary text-white">
            <Check className="size-3.5" />
          </span>
        ) : null}
      </div>

      <div className="mt-3.5 space-y-1">
        <p
          className={cn(
            "text-[13px] font-semibold leading-5",
            selected ? "text-primary" : "text-zinc-950",
          )}
        >
          {option.title}
        </p>
        <p className="text-[12px] leading-5 text-zinc-500">
          {option.description}
        </p>
      </div>
    </button>
  );
}

export function EditTopicsDialog({
  open,
  plan,
  onOpenChange,
  onSave,
}: EditTopicsDialogProps) {
  const [draft, setDraft] = useState<EditableStudyPlanFields>(plan);
  const [topicDrafts, setTopicDrafts] = useState<TopicDraft[]>(() =>
    createTopicDrafts(plan.topics),
  );
  const [draggedTopicIndex, setDraggedTopicIndex] = useState<number | null>(null);
  const [newMustCoverArea, setNewMustCoverArea] = useState("");
  const [newThingToAvoid, setNewThingToAvoid] = useState("");
  const [isAddingMustCoverArea, setIsAddingMustCoverArea] = useState(false);
  const [isAddingThingToAvoid, setIsAddingThingToAvoid] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  function updateChipField(field: DraftField, value: string) {
    const nextValue = value.trim();

    if (!nextValue) {
      return;
    }

    setDraft((current) => ({
      ...current,
      [field]: [...current[field], nextValue],
    }));
  }

  function closeWithoutSaving() {
    if (isSaving) {
      return;
    }

    setSaveError(null);
    onOpenChange(false);
  }

  function normalizeDraftList(values: string[]) {
    const seen = new Set<string>();

    return values
      .map((value) => value.trim())
      .filter((value) => {
        if (!value) {
          return false;
        }

        const normalized = value.toLowerCase();

        if (seen.has(normalized)) {
          return false;
        }

        seen.add(normalized);
        return true;
      });
  }

  function getSaveErrorMessage(error: unknown) {
    if (error instanceof Error && error.message) {
      return error.message;
    }

    return "We could not save those plan changes.";
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (isSaving) {
          return;
        }

        onOpenChange(nextOpen);
      }}
    >
      <DialogContent
        showCloseButton={false}
        className="h-dvh w-screen max-h-dvh max-w-none sm:h-auto sm:w-[min(980px,calc(100vw-32px))] sm:max-h-[min(94vh,900px)]"
      >
        <DialogHeader className="border-b border-zinc-200/80 px-5 py-4 sm:px-6 sm:py-5">
          <div className="flex items-start justify-between gap-4">
            <div className="space-y-1">
              <DialogTitle className="text-[1.2rem]">Edit Topics</DialogTitle>
              <DialogDescription className="text-[14px] leading-6">
                Review and customize the topics and approach for this interview
                plan.
              </DialogDescription>
            </div>

            <DialogClose
              disabled={isSaving}
              className="inline-flex size-9 items-center justify-center rounded-full border border-transparent text-zinc-500 transition-colors hover:bg-zinc-50 hover:text-zinc-900 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-primary/10 disabled:pointer-events-none disabled:opacity-50"
            >
              <X className="size-5" />
              <span className="sr-only">Close</span>
            </DialogClose>
          </div>
        </DialogHeader>

        <div className="overflow-y-auto">
          <DialogSection
            title="Core Topics"
            description="The key areas the AI should explore in this interview."
            action={
              <Button
                type="button"
                variant="ghost"
                disabled={isSaving}
                className="h-7 rounded-md px-2 text-[13px] text-primary hover:bg-primary/5 hover:text-primary"
                onClick={() =>
                  setTopicDrafts((current) => [
                    ...current,
                    { id: crypto.randomUUID(), value: "" },
                  ])
                }
              >
                <Plus className="size-4" />
                Add topic
              </Button>
            }
          >
            <div className="overflow-hidden rounded-2xl border border-zinc-200/80 bg-white">
              {topicDrafts.map((topicDraft, index) => (
                <TopicRow
                  key={topicDraft.id}
                  topic={topicDraft.value}
                  index={index}
                  isDragging={draggedTopicIndex === index}
                  onChange={(value) =>
                    setTopicDrafts((current) =>
                      current.map((currentTopicDraft, currentIndex) =>
                        currentIndex === index
                          ? { ...currentTopicDraft, value }
                          : currentTopicDraft,
                      ),
                    )
                  }
                  onDelete={() =>
                    setTopicDrafts((current) =>
                      current.filter((_, currentIndex) => currentIndex !== index),
                    )
                  }
                  onDragStart={() => setDraggedTopicIndex(index)}
                  onDragOver={() => {
                    if (draggedTopicIndex == null || draggedTopicIndex === index) {
                      return;
                    }

                    setTopicDrafts((current) =>
                      moveItem(current, draggedTopicIndex, index),
                    );
                    setDraggedTopicIndex(index);
                  }}
                  onDrop={() => setDraggedTopicIndex(null)}
                />
              ))}
            </div>
            <p className="mt-2 text-[12px] text-zinc-400">Drag to reorder topics</p>
          </DialogSection>

          <DialogSection
            title="Must-cover Areas (Optional)"
            description="Specific areas that must be covered during the interview."
            action={
              <Button
                type="button"
                variant="ghost"
                disabled={isSaving}
                className="h-7 rounded-md px-2 text-[13px] text-primary hover:bg-primary/5 hover:text-primary"
                onClick={() => setIsAddingMustCoverArea(true)}
              >
                <Plus className="size-4" />
                Add area
              </Button>
            }
          >
            <div className="space-y-3">
              <div className="flex flex-wrap gap-2">
                {draft.mustCoverAreas.map((area: string) => (
                  <EditableChip
                    key={area}
                    label={area}
                    onRemove={() =>
                      setDraft((current) => ({
                        ...current,
                        mustCoverAreas: current.mustCoverAreas.filter(
                          (currentArea: string) => currentArea !== area,
                        ),
                      }))
                    }
                  />
                ))}
              </div>

              {isAddingMustCoverArea ? (
                <AddChipControl
                  placeholder="Add a required area"
                  buttonLabel="Add area"
                  value={newMustCoverArea}
                  onValueChange={setNewMustCoverArea}
                  onSubmit={() => {
                    updateChipField("mustCoverAreas", newMustCoverArea);
                    setNewMustCoverArea("");
                    setIsAddingMustCoverArea(false);
                  }}
                  onCancel={() => {
                    setNewMustCoverArea("");
                    setIsAddingMustCoverArea(false);
                  }}
                />
              ) : null}
            </div>
          </DialogSection>

          <DialogSection
            title="Things to Avoid (Optional)"
            description="Topics or question types the AI should avoid."
            action={
              <Button
                type="button"
                variant="ghost"
                disabled={isSaving}
                className="h-7 rounded-md px-2 text-[13px] text-primary hover:bg-primary/5 hover:text-primary"
                onClick={() => setIsAddingThingToAvoid(true)}
              >
                <Plus className="size-4" />
                Add item
              </Button>
            }
          >
            <div className="space-y-3">
              <div className="flex flex-wrap gap-2">
                {draft.thingsToAvoid.map((item: string) => (
                  <EditableChip
                    key={item}
                    label={item}
                    onRemove={() =>
                      setDraft((current) => ({
                        ...current,
                        thingsToAvoid: current.thingsToAvoid.filter(
                          (currentItem: string) => currentItem !== item,
                        ),
                      }))
                    }
                  />
                ))}
              </div>

              {isAddingThingToAvoid ? (
                <AddChipControl
                  placeholder="Add something to avoid"
                  buttonLabel="Add item"
                  value={newThingToAvoid}
                  onValueChange={setNewThingToAvoid}
                  onSubmit={() => {
                    updateChipField("thingsToAvoid", newThingToAvoid);
                    setNewThingToAvoid("");
                    setIsAddingThingToAvoid(false);
                  }}
                  onCancel={() => {
                    setNewThingToAvoid("");
                    setIsAddingThingToAvoid(false);
                  }}
                />
              ) : null}
            </div>
          </DialogSection>

          <DialogSection
            title="Interviewer Behavior"
            description="How the AI should conduct the interview."
          >
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
              {interviewerBehaviorOptions.map((option) => (
                <InterviewBehaviorCard
                  key={option.id}
                  option={option}
                  selected={draft.selectedBehaviorId === option.id}
                  onSelect={() =>
                    setDraft((current) => ({
                      ...current,
                      selectedBehaviorId: option.id,
                    }))
                  }
                />
              ))}
            </div>
          </DialogSection>

          <DialogSection
            title="Interview Tone"
            description="The overall tone the AI should use."
          >
            <Select
              modal={false}
              value={draft.selectedTone}
              onValueChange={(value) =>
                setDraft((current) => ({
                  ...current,
                  selectedTone: String(value ?? ""),
                }))
              }
            >
              <SelectTrigger className="rounded-xl">
                <SelectValue placeholder="Select a tone" />
              </SelectTrigger>
              <SelectContent portalled={false}>
                {interviewToneOptions.map((tone) => (
                  <SelectItem key={tone} value={tone}>
                    {tone}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </DialogSection>
        </div>

        <DialogFooter className="border-t border-zinc-200/80 bg-white px-5 py-4 sm:px-6 sm:py-5">
          {saveError ? (
            <p className="w-full rounded-xl border border-rose-100 bg-rose-50 px-4 py-3 text-[13px] text-rose-600">
              {saveError}
            </p>
          ) : null}
          <Button
            type="button"
            variant="outline"
            size="lg"
            disabled={isSaving}
            className="h-10 rounded-xl px-5 text-[14px]"
            onClick={closeWithoutSaving}
          >
            Cancel
          </Button>
          <Button
            type="button"
            size="lg"
            disabled={isSaving}
            className="h-10 rounded-xl px-5 text-[14px] shadow-[0_24px_48px_-24px_rgba(29,78,216,0.5)]"
            onClick={async () => {
              const topics = normalizeDraftList(
                topicDrafts.map((topicDraft) => topicDraft.value),
              );

              if (topics.length === 0) {
                setSaveError("Add at least one topic before saving.");
                return;
              }

              setSaveError(null);
              setIsSaving(true);

              try {
                await onSave({
                  ...draft,
                  mustCoverAreas: normalizeDraftList(draft.mustCoverAreas),
                  thingsToAvoid: normalizeDraftList(draft.thingsToAvoid),
                  topics,
                });
                onOpenChange(false);
              } catch (error) {
                setSaveError(getSaveErrorMessage(error));
              } finally {
                setIsSaving(false);
              }
            }}
          >
            {isSaving ? "Saving..." : "Save Changes"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
