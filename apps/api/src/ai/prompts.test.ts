import assert from "node:assert/strict";
import { test } from "node:test";

import {
  buildInterviewerSystemPrompt,
  buildProgressPredictionPrompt,
  buildTurnAnnotationPrompt,
} from "./prompts.js";

test("interviewer prompt includes the approved plan and progression guidance", () => {
  const prompt = buildInterviewerSystemPrompt({
    event: "answer",
    participantResponses: {
      preferredName: "Alex",
    },
    plan: {
      exampleProbes: ["Can you walk me through a recent example?"],
      hypotheses: [
        "Users abandon the flow when too much financial detail is requested upfront.",
      ],
      mustCoverAreas: ["Onboarding friction", "Trust erosion"],
      objective: "Understand why users abandon budgeting tools after onboarding.",
      openingQuestion: "Can you walk me through the first time you tried the app?",
      probingStrategy: ["Start broad, then get concrete evidence."],
      selectedBehaviorId: "ask-for-examples",
      selectedTone: "Warm and curious",
      studyId: "study-1",
      subtitle: "Gen Z budgeting app study",
      thingsToAvoid: ["Leading questions"],
      title: "Budgeting app dropout",
      topics: ["Onboarding", "Trust erosion", "Retention triggers"],
    },
    progressState: {
      activeTopicLabel: "Trust erosion",
      completionRatio: 0.5,
      coveredTopicLabels: ["Onboarding"],
      remainingTopicLabels: ["Retention triggers"],
    },
    study: {
      audience: "Budgeting app users",
      context: "Mobile budgeting apps",
      createdAt: "2026-05-10T10:00:00.000Z",
      durationMinutes: 10,
      id: "study-1",
      interviewsTarget: 10,
      objective: "Understand why users abandon budgeting tools after onboarding.",
      slug: "budgeting-app-dropout",
      status: "interviewing",
      title: "Budgeting app dropout",
      updatedAt: "2026-05-10T10:00:00.000Z",
    },
    transcript: [
      {
        clientMessageId: null,
        createdAt: "2026-05-10T10:00:00.000Z",
        finishReason: null,
        id: "turn-1",
        model: null,
        providerResponseId: null,
        role: "assistant",
        sessionId: "session-1",
        sortOrder: 0,
        text: "Can you walk me through how onboarding felt?",
        timestampLabel: "10:00 AM",
      },
      {
        clientMessageId: "msg-1",
        createdAt: "2026-05-10T10:01:00.000Z",
        finishReason: null,
        id: "turn-2",
        model: null,
        providerResponseId: null,
        role: "user",
        sessionId: "session-1",
        sortOrder: 1,
        text: "It asked for too much financial detail.",
        timestampLabel: "10:01 AM",
      },
    ],
  });

  assert.match(prompt, /Hypotheses to test:/);
  assert.match(prompt, /Ordered topics to cover:/);
  assert.match(prompt, /Behavior guidance: Prefer specific recent examples/);
  assert.match(prompt, /Current active topic focus: Trust erosion/);
  assert.match(prompt, /If all plan topics are already covered, do not ask another substantive question/);
});

test("annotation prompt instructs the model to advance topics and complete the interview", () => {
  const prompt = buildTurnAnnotationPrompt({
    assistantText: "Thanks, that helps. What happened later that made you stop trusting it?",
    participantResponses: {
      preferredName: "Alex",
    },
    plan: {
      exampleProbes: ["What happened next?"],
      hypotheses: ["Trust drops when users are asked for sensitive information too early."],
      mustCoverAreas: ["Onboarding friction", "Trust erosion"],
      objective: "Understand why users abandon budgeting tools after onboarding.",
      openingQuestion: "Can you walk me through your first experience?",
      probingStrategy: ["Probe for specific moments."],
      selectedBehaviorId: "probe-emotional-language",
      selectedTone: "Warm and curious",
      studyId: "study-1",
      subtitle: "Gen Z budgeting app study",
      thingsToAvoid: ["Leading questions"],
      title: "Budgeting app dropout",
      topics: ["Onboarding", "Trust erosion", "Retention triggers"],
    },
    progressState: {
      activeTopicLabel: "Onboarding",
      completionRatio: 0.2,
      coveredTopicLabels: [],
      remainingTopicLabels: ["Trust erosion", "Retention triggers"],
    },
    study: {
      audience: "Budgeting app users",
      context: "Mobile budgeting apps",
      createdAt: "2026-05-10T10:00:00.000Z",
      durationMinutes: 10,
      id: "study-1",
      interviewsTarget: 10,
      objective: "Understand why users abandon budgeting tools after onboarding.",
      slug: "budgeting-app-dropout",
      status: "interviewing",
      title: "Budgeting app dropout",
      updatedAt: "2026-05-10T10:00:00.000Z",
    },
    transcript: [],
    userText: "It felt invasive right away because it asked for bank details before I understood the value.",
  });

  assert.match(prompt, /Treat the plan topics as an ordered agenda/);
  assert.match(prompt, /mark that topic covered and advance the active topic to the next uncovered topic/);
  assert.match(prompt, /If all topics are covered, set activeTopicLabel to null/);
  assert.match(prompt, /Hypotheses to test:/);
});

test("skip-question prompts explicitly forbid treating skip text as evidence", () => {
  const prompt = buildProgressPredictionPrompt({
    event: "skip-question",
    participantResponses: {},
    plan: {
      exampleProbes: ["What happened next?"],
      hypotheses: ["Users skip questions when they do not want to revisit a topic."],
      mustCoverAreas: ["Onboarding"],
      objective: "Understand onboarding drop-off.",
      openingQuestion: "Can you walk me through your first experience?",
      probingStrategy: ["Move forward when the participant skips."],
      selectedBehaviorId: "stay-neutral",
      selectedTone: "Warm and curious",
      studyId: "study-1",
      subtitle: "Test study",
      thingsToAvoid: ["Leading questions"],
      title: "Budgeting app dropout",
      topics: ["Onboarding", "Trust erosion"],
    },
    progressState: {
      activeTopicLabel: "Onboarding",
      completionRatio: 0.25,
      coveredTopicLabels: [],
      remainingTopicLabels: ["Trust erosion"],
    },
    study: {
      audience: "Budgeting app users",
      context: "Mobile budgeting apps",
      createdAt: "2026-05-10T10:00:00.000Z",
      durationMinutes: 10,
      id: "study-1",
      interviewsTarget: 10,
      objective: "Understand onboarding drop-off.",
      slug: "budgeting-app-dropout",
      status: "interviewing",
      title: "Budgeting app dropout",
      updatedAt: "2026-05-10T10:00:00.000Z",
    },
    transcript: [],
    userText: "Let's skip this question.",
  });

  assert.match(prompt, /The latest participant event was a skip, not an answer/);
  assert.match(prompt, /do not mark any topic as covered because of it/i);
});
