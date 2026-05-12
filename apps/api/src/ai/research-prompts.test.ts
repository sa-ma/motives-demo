import assert from "node:assert/strict";
import test from "node:test";

import {
  buildStudyPlanBodyPrompt,
  buildStudyPlanHypothesesPrompt,
} from "./research-prompts.js";

const study = {
  audience: "First-time managers with 3 to 10 direct reports",
  context: "Weekly 1:1s and lightweight coaching workflows",
  createdAt: "2026-05-10T10:00:00.000Z",
  durationMinutes: 20,
  id: "study-1",
  interviewsTarget: 8,
  objective: "Understand why first-time managers delay regular feedback.",
  slug: "manager-feedback-delay",
  status: "planning" as const,
  title: "Why do first-time managers avoid giving regular feedback?",
  updatedAt: "2026-05-10T10:00:00.000Z",
};

test("study plan hypotheses prompt is dedicated to objective and hypotheses", () => {
  const prompt = buildStudyPlanHypothesesPrompt({
    study,
    topics: ["Feedback timing", "Documentation", "Trust"],
  });

  assert.match(prompt, /Generate only the research objective and hypothesis set\./);
  assert.match(prompt, /Do not begin any hypothesis with the word hypothesis or hypotheses\./);
  assert.match(prompt, /Return exactly 4 to 6 hypotheses\./);
  assert.doesNotMatch(prompt, /Selected behavior should be the single behavior mode/);
  assert.doesNotMatch(prompt, /Return exactly 5 to 8 topics\./);
});

test("study plan body prompt treats hypotheses as fixed inputs", () => {
  const prompt = buildStudyPlanBodyPrompt({
    hypotheses: [
      "First-time managers delay regular feedback because they are unsure whether an issue reflects a pattern or a one-off moment.",
      "When weekly 1:1s are crowded with delivery work, first-time managers postpone coaching because status updates feel safer and easier to complete.",
    ],
    objective: "Understand why first-time managers delay regular feedback.",
    study,
    topics: ["Feedback timing", "Documentation", "Trust"],
  });

  assert.match(prompt, /The objective and hypotheses below are fixed inputs\./);
  assert.match(prompt, /Hypotheses:/);
  assert.match(prompt, /Return exactly 5 to 8 topics\./);
  assert.doesNotMatch(prompt, /Return exactly 4 to 6 hypotheses\./);
  assert.doesNotMatch(prompt, /Do not begin any hypothesis with the word hypothesis or hypotheses\./);
});
