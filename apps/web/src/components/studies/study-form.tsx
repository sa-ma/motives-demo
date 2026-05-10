"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Sparkles } from "lucide-react";
import { useState } from "react";
import { useRouter } from "next/navigation";

import { DurationSelector } from "@/components/studies/duration-selector";
import { FieldLayout } from "@/components/studies/study-field";
import { TopicChipList } from "@/components/studies/topic-chip-list";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { browserApiClient } from "@/lib/api/client";

const durationOptions = ["5 min", "10 min", "15 min", "20 min", "Custom"];

const initialTopics = [
  "Onboarding experience",
  "Emotional drivers",
  "Trust",
];

const studyCopy = {
  title: "Why do Gen Z users abandon budgeting apps?",
  objective:
    "Understand the emotional and practical reasons Gen Z users stop using budgeting apps after onboarding.",
  audience: "Gen Z (18–25), US, used budgeting app in last 6 months",
  context: "Mobile budgeting apps like Mint, YNAB, PocketGuard, etc.",
};

const maxLengths = {
  title: 120,
  objective: 600,
  audience: 200,
  context: 200,
  topics: 200,
};

function parseDurationMinutes(value: string) {
  const match = value.match(/\d+/);
  return match ? Number(match[0]) : 10;
}

export function StudyForm() {
  const queryClient = useQueryClient();
  const router = useRouter();
  const [title, setTitle] = useState(studyCopy.title);
  const [objective, setObjective] = useState(studyCopy.objective);
  const [audience, setAudience] = useState(studyCopy.audience);
  const [context, setContext] = useState(studyCopy.context);
  const [topics, setTopics] = useState(initialTopics);
  const [duration, setDuration] = useState("10 min");
  const [error, setError] = useState<string | null>(null);
  const createStudyMutation = useMutation({
    mutationFn: async () => {
      const createdStudy = await browserApiClient.studies.create({
        audience: audience.trim(),
        context: context.trim(),
        durationMinutes: parseDurationMinutes(duration),
        objective: objective.trim(),
        title: title.trim(),
        topics,
      });
      await browserApiClient.plans.generate(createdStudy.studyId);
      return createdStudy;
    },
    onSuccess: async (createdStudy) => {
      await queryClient.invalidateQueries({ queryKey: ["studies"] });
      router.push(`/studies/${createdStudy.studyId}/plan`);
    },
  });

  return (
    <form className="space-y-4" onSubmit={(event) => event.preventDefault()}>
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
            onChange={(event) => setContext(event.target.value)}
            className="min-h-22"
          />
        </FieldLayout>

        <FieldLayout
          id="must-cover-topics"
          label="Must-cover Topics"
          count={topics.join(", ").length}
          maxLength={maxLengths.topics}
          useLabel={false}
        >
          <div role="group" aria-labelledby="must-cover-topics-label">
            <TopicChipList
              topics={topics}
              hiddenCount={2}
              onRemove={(topic) =>
                setTopics((currentTopics) =>
                  currentTopics.filter((currentTopic) => currentTopic !== topic),
                )
              }
            />
          </div>
        </FieldLayout>
      </div>

      <div className="space-y-1.5">
        <p className="text-[12px] font-semibold text-black">
          Interview Length
        </p>
        <DurationSelector
          options={durationOptions}
          value={duration}
          onChange={setDuration}
        />
      </div>

      {error ? (
        <p className="rounded-xl border border-rose-100 bg-rose-50 px-4 py-3 text-[13px] text-rose-600">
          {error}
        </p>
      ) : null}

      <Button
        type="button"
        size="lg"
        disabled={createStudyMutation.isPending}
        onClick={() => {
          setError(null);

          if (!title.trim() || !objective.trim() || !audience.trim() || !context.trim()) {
            setError("Complete the study title, objective, audience, and context.");
            return;
          }

          if (topics.length === 0) {
            setError("Add at least one topic before generating the plan.");
            return;
          }

          createStudyMutation.mutate(undefined, {
            onError: () => {
              setError("We couldn't create the study right now. Please try again.");
            },
          });
        }}
        className="h-14 w-full rounded-md bg-primary text-[15px] font-semibold text-white shadow-[0_24px_48px_-24px_rgba(29,78,216,0.55)] hover:bg-primary/90"
      >
        <Sparkles className="size-4" />
        {createStudyMutation.isPending ? "Generating..." : "Generate Interview Plan"}
      </Button>
    </form>
  );
}
