import assert from "node:assert/strict";
import test from "node:test";

import type { SessionDebrief } from "@motives-ai/contracts";

import { normalizeSessionDebriefModel } from "./study-analysis.js";

test("normalizeSessionDebriefModel rescales legacy fractional top theme scores", () => {
  const debrief: SessionDebrief = {
    studyId: "study",
    sessionId: "session",
    participantLabel: "Participant 01",
    title: "Interview Debrief",
    subtitle: "AI debrief for Participant 01",
    summary: {
      keyTakeaway: "Trust broke early.",
      topThemes: [
        {
          label: " Setup felt overwhelming from the start ",
          score: 0.91,
          strength: "high",
        },
        {
          label: "Sync issues broke trust",
          score: 0.82,
          strength: "medium",
        },
        {
          label: "Quick abandonment",
          score: 0.69,
          strength: "low",
        },
      ],
      evidenceIds: ["evidence-1"],
      recommendedFollowUp: ["What happened next?"],
      whyThisMatters: "It explains abandonment.",
    },
    evidence: [
      {
        id: "evidence-1",
        quote: "It felt like too much work.",
        timestamp: "00:10",
        theme: "Onboarding",
        label: "Setup burden",
        whyItMatters: "It captures the friction.",
        followUp: "Which step felt worst?",
      },
    ],
    transcript: [
      {
        id: "turn-1",
        timestamp: "00:10",
        speaker: "participant",
        speakerLabel: "Participant",
        text: "It felt like too much work.",
        evidenceId: "evidence-1",
      },
    ],
    coverage: {
      researchObjective: "Understand drop-off.",
      topics: [
        {
          id: "topic-1",
          topic: "Onboarding",
          status: "covered",
          evidenceStrength: "high",
          score: 4,
        },
      ],
      missedAreas: [],
      interviewQuality: {
        coverage: "High",
        depth: "Medium",
        participantEngagement: "Medium",
      },
    },
    reasoning: [
      {
        id: "reasoning-1",
        timestamp: "00:00",
        trigger: "Opening",
        aiDecision: "Asked a broad question.",
        researchPurpose: "Set context.",
        status: "completed",
      },
    ],
  };

  const normalized = normalizeSessionDebriefModel(debrief);

  assert.deepEqual(
    normalized.summary.topThemes.map((theme) => ({
      label: theme.label,
      score: theme.score,
      strength: theme.strength,
    })),
    [
      {
        label: "Setup felt overwhelming from the start",
        score: 4,
        strength: "high",
      },
      {
        label: "Sync issues broke trust",
        score: 3,
        strength: "medium",
      },
      {
        label: "Quick abandonment",
        score: 2,
        strength: "low",
      },
    ],
  );
});
