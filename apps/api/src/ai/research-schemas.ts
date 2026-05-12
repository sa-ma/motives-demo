import { jsonSchema } from "ai";
import { Type, type Static } from "@sinclair/typebox";

import { InterviewBehaviorIdSchema } from "@motives-ai/contracts/plans";

const GeneratedStudyPlanObjectiveSchema = Type.String({
  description:
    "One clear sentence describing exactly what the interview should help the team learn.",
  minLength: 12,
  maxLength: 240,
});

const GeneratedStudyPlanHypothesisItemSchema = Type.String({
  description:
    "One complete sentence stating a causal claim about participant behavior, belief, friction, or tradeoff. State what participants do and why they do it.",
  minLength: 12,
  maxLength: 220,
});

const GeneratedStudyPlanHypothesesSchema = Type.Array(
  GeneratedStudyPlanHypothesisItemSchema,
  {
    description:
      "Return 4 to 6 concrete hypotheses. Each item should read like Participants do X because Y or When Z, participants do X because Y.",
    minItems: 4,
    maxItems: 6,
  },
);

const GeneratedStudyPlanTopicsSchema = Type.Array(
  Type.String({
    description:
      "A short, specific label for one discussion area to explore in the interview. Not a question and not a vague filler label.",
    minLength: 3,
    maxLength: 80,
  }),
  {
    description:
      "Return 5 to 8 focused topics that organize the interview into meaningful discussion areas.",
    minItems: 5,
    maxItems: 8,
  },
);

const GeneratedStudyPlanOpeningQuestionSchema = Type.String({
  description:
    "One natural, non-leading opening question that invites the participant to start with a real experience.",
  minLength: 12,
  maxLength: 220,
  pattern: ".*\\?$",
});

const GeneratedStudyPlanProbingStrategySchema = Type.Array(
  Type.String({
    description:
      "A practical interviewer tactic for getting clearer evidence, richer examples, or more specific detail.",
    minLength: 12,
    maxLength: 160,
  }),
  {
    description:
      "Return 4 to 6 probing strategies that help the interviewer adapt during the conversation.",
    minItems: 4,
    maxItems: 6,
  },
);

const GeneratedStudyPlanExampleProbesSchema = Type.Array(
  Type.String({
    description:
      "One standalone follow-up question the interviewer could ask verbatim. It must be a single question.",
    minLength: 12,
    maxLength: 220,
    pattern: ".*\\?$",
  }),
  {
    description:
      "Return 5 to 8 concrete example probes. Each item must be one natural-sounding question.",
    minItems: 5,
    maxItems: 8,
  },
);

const GeneratedStudyPlanMustCoverAreasSchema = Type.Array(
  Type.String({
    description:
      "A concrete piece of information the interviewer must capture before the interview ends.",
    minLength: 12,
    maxLength: 160,
  }),
  {
    description:
      "Return 5 to 8 specific must-cover areas. These should name evidence to collect, not generic reminders.",
    minItems: 5,
    maxItems: 8,
  },
);

const GeneratedStudyPlanThingsToAvoidSchema = Type.Array(
  Type.String({
    description:
      "A specific interviewing mistake, bias risk, or dead end to avoid during the session.",
    minLength: 12,
    maxLength: 160,
  }),
  {
    description:
      "Return 4 to 6 specific things to avoid. Each item should prevent a concrete interviewing failure mode.",
    minItems: 4,
    maxItems: 6,
  },
);

const GeneratedStudyPlanSelectedToneSchema = Type.String({
  description:
    "A short phrase describing the interviewer tone, such as calm, direct or warm and curious.",
  minLength: 3,
  maxLength: 60,
});

export const GeneratedStudyPlanHypothesesOutputSchema = Type.Object(
  {
    objective: GeneratedStudyPlanObjectiveSchema,
    hypotheses: GeneratedStudyPlanHypothesesSchema,
  },
  { additionalProperties: false },
);

export type GeneratedStudyPlanHypothesesOutput = Static<
  typeof GeneratedStudyPlanHypothesesOutputSchema
>;

export const generatedStudyPlanHypothesesOutputJsonSchema =
  jsonSchema<GeneratedStudyPlanHypothesesOutput>(
    GeneratedStudyPlanHypothesesOutputSchema,
  );

export const GeneratedStudyPlanBodyOutputSchema = Type.Object(
  {
    topics: GeneratedStudyPlanTopicsSchema,
    openingQuestion: GeneratedStudyPlanOpeningQuestionSchema,
    probingStrategy: GeneratedStudyPlanProbingStrategySchema,
    exampleProbes: GeneratedStudyPlanExampleProbesSchema,
    mustCoverAreas: GeneratedStudyPlanMustCoverAreasSchema,
    thingsToAvoid: GeneratedStudyPlanThingsToAvoidSchema,
    selectedBehaviorId: InterviewBehaviorIdSchema,
    selectedTone: GeneratedStudyPlanSelectedToneSchema,
  },
  { additionalProperties: false },
);

export type GeneratedStudyPlanBodyOutput = Static<
  typeof GeneratedStudyPlanBodyOutputSchema
>;

export const generatedStudyPlanBodyOutputJsonSchema =
  jsonSchema<GeneratedStudyPlanBodyOutput>(GeneratedStudyPlanBodyOutputSchema);

export const GeneratedStudyPlanOutputSchema = Type.Object(
  {
    objective: GeneratedStudyPlanObjectiveSchema,
    hypotheses: GeneratedStudyPlanHypothesesSchema,
    topics: GeneratedStudyPlanTopicsSchema,
    openingQuestion: GeneratedStudyPlanOpeningQuestionSchema,
    probingStrategy: GeneratedStudyPlanProbingStrategySchema,
    exampleProbes: GeneratedStudyPlanExampleProbesSchema,
    mustCoverAreas: GeneratedStudyPlanMustCoverAreasSchema,
    thingsToAvoid: GeneratedStudyPlanThingsToAvoidSchema,
    selectedBehaviorId: InterviewBehaviorIdSchema,
    selectedTone: GeneratedStudyPlanSelectedToneSchema,
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
