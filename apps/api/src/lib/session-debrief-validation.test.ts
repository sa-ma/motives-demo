import assert from "node:assert/strict";
import test from "node:test";

import type { StudyPlan } from "@motives-ai/contracts";

import type { TranscriptTurnRow } from "../db/schema.js";
import {
  InvalidGeneratedSessionDebriefError,
  validateGeneratedSessionDebriefOutput,
} from "./session-debrief-validation.js";

const plan: StudyPlan = {
  studyId: "study",
  title: "Budgeting study",
  subtitle: "Test plan",
  objective: "Understand abandonment.",
  hypotheses: ["Hypothesis 1", "Hypothesis 2", "Hypothesis 3", "Hypothesis 4"],
  topics: ["Topic A", "Topic B", "Topic C", "Topic D", "Topic E"],
  openingQuestion: "What made you try the app?",
  probingStrategy: ["Probe 1", "Probe 2", "Probe 3", "Probe 4"],
  exampleProbes: ["Example 1?", "Example 2?", "Example 3?", "Example 4?", "Example 5?"],
  mustCoverAreas: ["Area 1", "Area 2", "Area 3", "Area 4", "Area 5"],
  thingsToAvoid: ["Avoid 1", "Avoid 2", "Avoid 3", "Avoid 4"],
  selectedBehaviorId: "ask-for-examples",
  selectedTone: "calm",
  estimatedDurationLabel: "~15 min",
};

const transcript: TranscriptTurnRow[] = [
  {
    clientMessageId: null,
    createdAt: "2026-05-11T00:00:00.000Z",
    finishReason: null,
    id: "turn_1",
    model: null,
    providerResponseId: null,
    role: "assistant",
    sessionId: "session",
    sortOrder: 0,
    text: "What made you try the app?",
    timestampLabel: "00:00",
  },
  {
    clientMessageId: "msg_1",
    createdAt: "2026-05-11T00:00:10.000Z",
    finishReason: null,
    id: "turn_2",
    model: null,
    providerResponseId: null,
    role: "user",
    sessionId: "session",
    sortOrder: 1,
    text: "I needed help controlling my spending.",
    timestampLabel: "00:10",
  },
];

test("validateGeneratedSessionDebriefOutput accepts consistent coverage and grounded quotes", () => {
  assert.doesNotThrow(() =>
    validateGeneratedSessionDebriefOutput({
      output: {
        contradictions: [],
        emotionSignal: "medium",
        evidence: [
          {
            followUp: "What else happened?",
            label: "Topic A",
            quote: "I needed help controlling my spending.",
            theme: "Topic A",
            whyItMatters: "It explains the initial motivation.",
          },
          {
            followUp: "How did that change over time?",
            label: "Topic B",
            quote: "I needed help controlling my spending.",
            theme: "Topic B",
            whyItMatters: "It anchors the later behavior.",
          },
        ],
        interviewQuality: {
          coverage: "6/10",
          depth: "6/10",
          participantEngagement: "Medium",
        },
        keyTakeaway: "The participant adopted the app for spending control.",
        missedAreas: ["Topic C"],
        recommendedFollowUp: ["What changed after the first week?", "What made it less useful later?"],
        reasoning: [
          {
            aiDecision: "Asked about motivation first.",
            researchPurpose: "Anchor the timeline.",
            status: "completed",
            timestamp: "00:00",
            trigger: "Opening",
          },
          {
            aiDecision: "Noted a coverage gap.",
            researchPurpose: "Save for later sessions.",
            status: "planned",
            timestamp: "00:20",
            trigger: "Gap",
          },
          {
            aiDecision: "Probed for specifics.",
            researchPurpose: "Gather evidence.",
            status: "completed",
            timestamp: "00:15",
            trigger: "Participant response",
          },
        ],
        topicCoverage: [
          { topic: "Topic A", status: "covered", evidenceStrength: "high", score: 4 },
          { topic: "Topic B", status: "in-progress", evidenceStrength: "medium", score: 2 },
          { topic: "Topic C", status: "weak-evidence", evidenceStrength: "low", score: 1 },
          { topic: "Topic D", status: "not-explored", evidenceStrength: "none", score: 0 },
          { topic: "Topic E", status: "not-explored", evidenceStrength: "none", score: 0 },
        ],
        topThemes: [
          { label: "Topic A", score: 4, strength: "high" },
          { label: "Topic B", score: 3, strength: "medium" },
        ],
        whyThisMatters: "It identifies the original value driver.",
      },
      plan,
      transcript,
    }),
  );
});

test("validateGeneratedSessionDebriefOutput rejects impossible topic coverage combinations", () => {
  assert.throws(
    () =>
      validateGeneratedSessionDebriefOutput({
        output: {
          contradictions: [],
          emotionSignal: "low",
          evidence: [
            {
              followUp: "What else happened?",
              label: "Topic A",
              quote: "I needed help controlling my spending.",
              theme: "Topic A",
              whyItMatters: "It explains the initial motivation.",
            },
            {
              followUp: "How did that change over time?",
              label: "Topic B",
              quote: "I needed help controlling my spending.",
              theme: "Topic B",
              whyItMatters: "It anchors the later behavior.",
            },
          ],
          interviewQuality: {
            coverage: "2/10",
            depth: "2/10",
            participantEngagement: "Low",
          },
          keyTakeaway: "Too little evidence.",
          missedAreas: ["Topic B"],
          recommendedFollowUp: ["Retry later", "Gather more evidence"],
          reasoning: [
            {
              aiDecision: "Stopped early.",
              researchPurpose: "Limited data.",
              status: "completed",
              timestamp: "00:00",
              trigger: "Short interview",
            },
            {
              aiDecision: "Could not validate topic coverage.",
              researchPurpose: "Avoid hallucination.",
              status: "planned",
              timestamp: "00:15",
              trigger: "Missing evidence",
            },
            {
              aiDecision: "Saved gaps for later.",
              researchPurpose: "Document uncertainty.",
              status: "planned",
              timestamp: "00:20",
              trigger: "Coverage gap",
            },
          ],
          topicCoverage: [
            { topic: "Topic A", status: "covered", evidenceStrength: "high", score: 1 },
            { topic: "Topic B", status: "not-explored", evidenceStrength: "none", score: 0 },
            { topic: "Topic C", status: "not-explored", evidenceStrength: "none", score: 0 },
            { topic: "Topic D", status: "not-explored", evidenceStrength: "none", score: 0 },
            { topic: "Topic E", status: "not-explored", evidenceStrength: "none", score: 0 },
          ],
          topThemes: [
            { label: "Topic A", score: 1, strength: "low" },
            { label: "Topic B", score: 1, strength: "low" },
          ],
          whyThisMatters: "It should fail validation.",
        },
        plan,
        transcript,
      }),
    InvalidGeneratedSessionDebriefError,
  );
});

test("validateGeneratedSessionDebriefOutput rejects top themes that do not match the debrief scale", () => {
  assert.throws(
    () =>
      validateGeneratedSessionDebriefOutput({
        output: {
          contradictions: [],
          emotionSignal: "medium",
          evidence: [
            {
              followUp: "What else happened?",
              label: "Topic A",
              quote: "I needed help controlling my spending.",
              theme: "Topic A",
              whyItMatters: "It explains the initial motivation.",
            },
            {
              followUp: "How did that change over time?",
              label: "Topic B",
              quote: "I needed help controlling my spending.",
              theme: "Topic B",
              whyItMatters: "It anchors the later behavior.",
            },
          ],
          interviewQuality: {
            coverage: "6/10",
            depth: "6/10",
            participantEngagement: "Medium",
          },
          keyTakeaway: "The participant adopted the app for spending control.",
          missedAreas: ["Topic C"],
          recommendedFollowUp: [
            "What changed after the first week?",
            "What made it less useful later?",
          ],
          reasoning: [
            {
              aiDecision: "Asked about motivation first.",
              researchPurpose: "Anchor the timeline.",
              status: "completed",
              timestamp: "00:00",
              trigger: "Opening",
            },
            {
              aiDecision: "Noted a coverage gap.",
              researchPurpose: "Save for later sessions.",
              status: "planned",
              timestamp: "00:20",
              trigger: "Gap",
            },
            {
              aiDecision: "Probed for specifics.",
              researchPurpose: "Gather evidence.",
              status: "completed",
              timestamp: "00:15",
              trigger: "Participant response",
            },
          ],
          topicCoverage: [
            { topic: "Topic A", status: "covered", evidenceStrength: "high", score: 4 },
            { topic: "Topic B", status: "in-progress", evidenceStrength: "medium", score: 2 },
            { topic: "Topic C", status: "weak-evidence", evidenceStrength: "low", score: 1 },
            { topic: "Topic D", status: "not-explored", evidenceStrength: "none", score: 0 },
            { topic: "Topic E", status: "not-explored", evidenceStrength: "none", score: 0 },
          ],
          topThemes: [
            { label: "This label is much too long to fit cleanly in the debrief summary card and should fail", score: 1, strength: "high" },
            { label: "Topic B", score: 3, strength: "medium" },
          ],
          whyThisMatters: "It identifies the original value driver.",
        },
        plan,
        transcript,
      }),
    InvalidGeneratedSessionDebriefError,
  );
});
