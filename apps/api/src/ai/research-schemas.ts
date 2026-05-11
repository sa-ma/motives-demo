import { jsonSchema } from "ai";
import { Type, type Static } from "@sinclair/typebox";

import { InterviewBehaviorIdSchema } from "@motives-ai/contracts/plans";

export const GeneratedStudyPlanOutputSchema = Type.Object(
  {
    objective: Type.String({ minLength: 12, maxLength: 240 }),
    hypotheses: Type.Array(Type.String({ minLength: 12, maxLength: 160 }), {
      minItems: 4,
      maxItems: 6,
    }),
    topics: Type.Array(Type.String({ minLength: 3, maxLength: 80 }), {
      minItems: 5,
      maxItems: 8,
    }),
    openingQuestion: Type.String({
      minLength: 12,
      maxLength: 220,
      pattern: ".*\\?$",
    }),
    probingStrategy: Type.Array(Type.String({ minLength: 12, maxLength: 160 }), {
      minItems: 4,
      maxItems: 6,
    }),
    exampleProbes: Type.Array(
      Type.String({
        minLength: 12,
        maxLength: 220,
        pattern: ".*\\?$",
      }),
      {
        minItems: 5,
        maxItems: 8,
      },
    ),
    mustCoverAreas: Type.Array(Type.String({ minLength: 12, maxLength: 160 }), {
      minItems: 5,
      maxItems: 8,
    }),
    thingsToAvoid: Type.Array(Type.String({ minLength: 12, maxLength: 160 }), {
      minItems: 4,
      maxItems: 6,
    }),
    selectedBehaviorId: InterviewBehaviorIdSchema,
    selectedTone: Type.String({ minLength: 3, maxLength: 60 }),
  },
  { additionalProperties: false },
);

export type GeneratedStudyPlanOutput = Static<typeof GeneratedStudyPlanOutputSchema>;

export const generatedStudyPlanOutputJsonSchema =
  jsonSchema<GeneratedStudyPlanOutput>(GeneratedStudyPlanOutputSchema);

export const DebriefThemeSchema = Type.Object(
  {
    label: Type.String(),
    score: Type.Number(),
    strength: Type.Union([
      Type.Literal("high"),
      Type.Literal("medium"),
      Type.Literal("low"),
    ]),
  },
  { additionalProperties: false },
);

export const DebriefEvidenceItemSchema = Type.Object(
  {
    quote: Type.String(),
    label: Type.String(),
    theme: Type.String(),
    whyItMatters: Type.String(),
    followUp: Type.String(),
  },
  { additionalProperties: false },
);

export const DebriefCoverageTopicSchema = Type.Object(
  {
    topic: Type.String(),
    status: Type.Union([
      Type.Literal("covered"),
      Type.Literal("in-progress"),
      Type.Literal("weak-evidence"),
      Type.Literal("not-explored"),
    ]),
    evidenceStrength: Type.Union([
      Type.Literal("high"),
      Type.Literal("medium"),
      Type.Literal("low"),
      Type.Literal("none"),
    ]),
    score: Type.Number(),
  },
  { additionalProperties: false },
);

export const DebriefReasoningRowSchema = Type.Object(
  {
    timestamp: Type.String(),
    trigger: Type.String(),
    aiDecision: Type.String(),
    researchPurpose: Type.String(),
    status: Type.Union([
      Type.Literal("completed"),
      Type.Literal("in-progress"),
      Type.Literal("planned"),
    ]),
  },
  { additionalProperties: false },
);

export const SessionDebriefOutputSchema = Type.Object(
  {
    contradictions: Type.Array(Type.String(), { maxItems: 5 }),
    emotionSignal: Type.Union([
      Type.Literal("low"),
      Type.Literal("medium"),
      Type.Literal("high"),
    ]),
    evidence: Type.Array(DebriefEvidenceItemSchema, { minItems: 2, maxItems: 4 }),
    interviewQuality: Type.Object(
      {
        coverage: Type.String(),
        depth: Type.String(),
        participantEngagement: Type.String(),
      },
      { additionalProperties: false },
    ),
    keyTakeaway: Type.String(),
    missedAreas: Type.Array(Type.String(), { maxItems: 4 }),
    recommendedFollowUp: Type.Array(Type.String(), { minItems: 2, maxItems: 5 }),
    reasoning: Type.Array(DebriefReasoningRowSchema, { minItems: 3, maxItems: 6 }),
    topicCoverage: Type.Array(DebriefCoverageTopicSchema),
    topThemes: Type.Array(DebriefThemeSchema, { minItems: 2, maxItems: 5 }),
    whyThisMatters: Type.String(),
  },
  { additionalProperties: false },
);

export type SessionDebriefOutput = Static<typeof SessionDebriefOutputSchema>;

export const sessionDebriefOutputJsonSchema =
  jsonSchema<SessionDebriefOutput>(SessionDebriefOutputSchema);

export const StudyAggregateOutputSchema = Type.Object(
  {
    observation: Type.String(),
    themes: Type.Array(Type.String(), { minItems: 2, maxItems: 6 }),
  },
  { additionalProperties: false },
);

export type StudyAggregateOutput = Static<typeof StudyAggregateOutputSchema>;

export const studyAggregateOutputJsonSchema =
  jsonSchema<StudyAggregateOutput>(StudyAggregateOutputSchema);
