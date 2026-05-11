import { Type, type Static } from "@sinclair/typebox";

export const InterviewBehaviorIdSchema = Type.Union([
  Type.Literal("probe-emotional-language"),
  Type.Literal("ask-for-examples"),
  Type.Literal("challenge-contradictions"),
  Type.Literal("stay-neutral"),
  Type.Literal("avoid-leading-questions"),
]);

export type InterviewBehaviorId = Static<typeof InterviewBehaviorIdSchema>;

export const StudyPlanSchema = Type.Object({
  studyId: Type.String(),
  title: Type.String(),
  subtitle: Type.String(),
  estimatedDurationLabel: Type.Optional(Type.String()),
  estimatedDurationMinutes: Type.Optional(
    Type.Number({ minimum: 1, maximum: 120 }),
  ),
  objective: Type.String(),
  hypotheses: Type.Array(Type.String()),
  topics: Type.Array(Type.String()),
  openingQuestion: Type.String(),
  probingStrategy: Type.Array(Type.String()),
  exampleProbes: Type.Array(Type.String()),
  mustCoverAreas: Type.Array(Type.String()),
  thingsToAvoid: Type.Array(Type.String()),
  selectedBehaviorId: InterviewBehaviorIdSchema,
  selectedTone: Type.String(),
});

export type StudyPlan = Static<typeof StudyPlanSchema>;

export const GeneratePlanInputSchema = Type.Object({}, { additionalProperties: false });

export type GeneratePlanInput = Static<typeof GeneratePlanInputSchema>;

export const UpdateStudyPlanInputSchema = Type.Object(
  {
    topics: Type.Array(Type.String({ minLength: 1, maxLength: 120 }), {
      minItems: 1,
      maxItems: 12,
    }),
    mustCoverAreas: Type.Array(Type.String({ minLength: 1, maxLength: 120 }), {
      maxItems: 12,
    }),
    thingsToAvoid: Type.Array(Type.String({ minLength: 1, maxLength: 120 }), {
      maxItems: 12,
    }),
    selectedBehaviorId: InterviewBehaviorIdSchema,
    selectedTone: Type.String({ minLength: 1, maxLength: 120 }),
  },
  { additionalProperties: false },
);

export type UpdateStudyPlanInput = Static<typeof UpdateStudyPlanInputSchema>;

export const ApprovePlanResponseSchema = Type.Object({
  studyId: Type.String(),
  approvedPlanVersionId: Type.String(),
  approvedAt: Type.String(),
});

export type ApprovePlanResponse = Static<typeof ApprovePlanResponseSchema>;
