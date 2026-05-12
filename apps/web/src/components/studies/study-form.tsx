"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, Sparkles } from "lucide-react";
import {
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent,
} from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { FieldLayout } from "@/components/studies/study-field";
import { TopicChipList } from "@/components/studies/topic-chip-list";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { browserApiClient } from "@/lib/api/client";

const demoTopics = [
  "First trial trigger",
  "Perceived value",
  "Repeat purchase barrier",
];

const demoStudyDefaults = {
  title: "Why are first-time buyers not reordering our barrier repair serum?",
  objective:
    "Understand what prevents first-time serum buyers from building our product into their routine and placing a second order.",
  audience: "US adults 25-44 who bought a prestige skincare serum in the last 90 days",
  context:
    "Our skincare brand launched a barrier repair serum and wants to learn why trial is not turning into repeat purchase.",
  targetParticipants: "5",
};

const fieldPlaceholders = {
  title: "Why are first-time buyers not reordering our barrier repair serum?",
  objective: "Describe what you want to learn from the interviews.",
  audience: "Who should participate in this study?",
  context: "What product, workflow, or market context should the interviewer know?",
  topic: "Add a must-cover topic",
  targetParticipants: demoStudyDefaults.targetParticipants,
};

const maxLengths = {
  title: 120,
  objective: 600,
  audience: 200,
  context: 200,
};

const maxTopics = 12;
const maxTopicLength = 100;

export function StudyForm() {
  const queryClient = useQueryClient();
  const router = useRouter();
  const topicInputRef = useRef<HTMLInputElement | null>(null);
  const [title, setTitle] = useState(demoStudyDefaults.title);
  const [objective, setObjective] = useState(demoStudyDefaults.objective);
  const [audience, setAudience] = useState(demoStudyDefaults.audience);
  const [context, setContext] = useState(demoStudyDefaults.context);
  const [topics, setTopics] = useState<string[]>(demoTopics);
  const [newTopic, setNewTopic] = useState("");
  const [isAddingTopic, setIsAddingTopic] = useState(false);
  const [targetParticipants, setTargetParticipants] = useState(
    demoStudyDefaults.targetParticipants,
  );
  const [error, setError] = useState<string | null>(null);
  const createStudyMutation = useMutation({
    mutationFn: async () =>
      browserApiClient.studies.create({
        audience: audience.trim(),
        context: context.trim(),
        objective: objective.trim(),
        targetParticipants: Number(targetParticipants),
        title: title.trim(),
        topics,
      }),
    onSuccess: (createdStudy) => {
      void queryClient.invalidateQueries({ queryKey: ["studies"] });
      router.push(`/studies/${createdStudy.studyId}/plan`);
    },
  });

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (createStudyMutation.isPending) {
      return;
    }

    setError(null);

    if (!title.trim() || !objective.trim() || !audience.trim() || !context.trim()) {
      setError("Complete the study title, objective, audience, and context.");
      return;
    }

    if (topics.length === 0) {
      setError("Add at least one topic before generating the plan.");
      return;
    }

    const parsedTargetParticipants = Number(targetParticipants);

    if (
      !Number.isInteger(parsedTargetParticipants) ||
      parsedTargetParticipants < 1 ||
      parsedTargetParticipants > 50
    ) {
      setError("Choose a target participant count between 1 and 50.");
      return;
    }

    createStudyMutation.mutate(undefined, {
      onError: () => {
        toast.error("We couldn't create the study right now. Please try again.");
      },
    });
  }

  useEffect(() => {
    if (!isAddingTopic) {
      return;
    }

    topicInputRef.current?.focus();
  }, [isAddingTopic]);

  function handleAddTopic() {
    const nextTopic = newTopic.trim();

    if (!nextTopic) {
      return;
    }

    if (nextTopic.length > maxTopicLength) {
      setError(`Keep each topic under ${maxTopicLength} characters.`);
      return;
    }

    if (topics.length >= maxTopics) {
      setError(`You can add up to ${maxTopics} must-cover topics.`);
      return;
    }

    if (topics.some((topic) => topic.toLowerCase() === nextTopic.toLowerCase())) {
      setError("That topic is already on the list.");
      return;
    }

    setTopics((currentTopics) => [...currentTopics, nextTopic]);
    setNewTopic("");
    setIsAddingTopic(false);
    setError(null);
  }

  function handleShowTopicInput() {
    setError(null);
    setIsAddingTopic(true);
  }

  function handleCancelTopic() {
    setNewTopic("");
    setIsAddingTopic(false);
    setError(null);
  }

  function handleTopicKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key !== "Enter") {
      return;
    }

    event.preventDefault();
    handleAddTopic();
  }

  return (
    <form className="space-y-4" onSubmit={handleSubmit}>
      <FieldLayout
        id="study-title"
        label="Study Title"
        count={title.length}
        maxLength={maxLengths.title}
      >
        <Input
          id="study-title"
          maxLength={maxLengths.title}
          value={title}
          placeholder={fieldPlaceholders.title}
          onChange={(event) => setTitle(event.target.value)}
        />
      </FieldLayout>

      <FieldLayout
        id="study-objective"
        label="Research Objective"
        count={objective.length}
        maxLength={maxLengths.objective}
      >
        <Textarea
          id="study-objective"
          maxLength={maxLengths.objective}
          value={objective}
          placeholder={fieldPlaceholders.objective}
          onChange={(event) => setObjective(event.target.value)}
          className="min-h-32"
        />
      </FieldLayout>

      <FieldLayout
        id="target-audience"
        label="Target Audience"
        count={audience.length}
        maxLength={maxLengths.audience}
      >
        <Input
          id="target-audience"
          maxLength={maxLengths.audience}
          value={audience}
          placeholder={fieldPlaceholders.audience}
          onChange={(event) => setAudience(event.target.value)}
        />
      </FieldLayout>

      <div className="grid gap-3.5 xl:grid-cols-[minmax(0,0.94fr)_minmax(0,1.06fr)]">
        <FieldLayout
          id="product-context"
          label="Product / Context"
          count={context.length}
          maxLength={maxLengths.context}
        >
          <Textarea
            id="product-context"
            maxLength={maxLengths.context}
            value={context}
            placeholder={fieldPlaceholders.context}
            onChange={(event) => setContext(event.target.value)}
            className="min-h-22"
          />
        </FieldLayout>

        <FieldLayout
          id="must-cover-topics"
          label="Must-cover Topics"
          count={topics.length}
          maxLength={maxTopics}
          labelAction={
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={handleShowTopicInput}
              disabled={topics.length >= maxTopics || isAddingTopic}
              aria-expanded={isAddingTopic}
              className="h-auto px-0 text-[12px] font-semibold text-primary hover:bg-transparent hover:text-primary/80"
            >
              <Plus className="size-3.5" />
              Add topic
            </Button>
          }
          useLabel={false}
        >
          <div role="group" aria-labelledby="must-cover-topics-label" className="space-y-2.5">
            <TopicChipList
              topics={topics}
              onRemove={(topic) =>
                setTopics((currentTopics) =>
                  currentTopics.filter((currentTopic) => currentTopic !== topic),
                )
              }
            />
            {isAddingTopic ? (
              <div className="flex gap-2">
                <Input
                  id="must-cover-topics"
                  ref={topicInputRef}
                  value={newTopic}
                  maxLength={maxTopicLength}
                  placeholder={fieldPlaceholders.topic}
                  onChange={(event) => setNewTopic(event.target.value)}
                  onKeyDown={handleTopicKeyDown}
                />
                <Button
                  type="button"
                  variant="outline"
                  size="lg"
                  onClick={handleAddTopic}
                  className="shrink-0"
                >
                  Save
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="lg"
                  onClick={handleCancelTopic}
                  className="shrink-0"
                >
                  Cancel
                </Button>
              </div>
            ) : null}
            <p className="text-[12px] leading-5 text-zinc-500">
              Add up to {maxTopics} topics the interviewer must cover.
            </p>
          </div>
        </FieldLayout>
      </div>

      <div className="space-y-1.5">
        <label
          htmlFor="target-participants"
          className="block text-[12px] font-semibold text-black"
        >
          Target Participants
        </label>
        <Input
          id="target-participants"
          type="number"
          min={1}
          max={50}
          inputMode="numeric"
          value={targetParticipants}
          placeholder={fieldPlaceholders.targetParticipants}
          onChange={(event) => setTargetParticipants(event.target.value)}
        />
        <p className="text-[12px] leading-5 text-zinc-500">
          Choose how many participant interviews you want to complete for this study.
        </p>
      </div>

      {error ? (
        <p className="rounded-xl border border-rose-100 bg-rose-50 px-4 py-3 text-[13px] text-rose-600">
          {error}
        </p>
      ) : null}

      <Button
        type="submit"
        size="lg"
        disabled={createStudyMutation.isPending}
        className="h-14 w-full rounded-md bg-primary text-[15px] font-semibold text-white shadow-[0_24px_48px_-24px_rgba(29,78,216,0.55)] hover:bg-primary/90"
      >
        <Sparkles className="size-4" />
        {createStudyMutation.isPending ? "Creating study..." : "Generate Interview Plan"}
      </Button>
    </form>
  );
}
