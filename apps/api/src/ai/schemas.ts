import { jsonSchema } from "ai";
import { Type, type Static } from "@sinclair/typebox";

import { InterviewCoverageStateSchema } from "../lib/interview-coverage.js";

export const InterviewCoverageEvaluationOutputSchema = Type.Object(
  {
    contradictions: Type.Array(Type.String()),
    coverageState: InterviewCoverageStateSchema,
    emotionSignal: Type.Union([
      Type.Literal("low"),
      Type.Literal("medium"),
      Type.Literal("high"),
    ]),
    evidenceQuotes: Type.Array(Type.String(), {
      maxItems: 3,
    }),
  },
  { additionalProperties: false },
);

export type InterviewCoverageEvaluationOutput = Static<
  typeof InterviewCoverageEvaluationOutputSchema
>;

export const interviewCoverageEvaluationOutputJsonSchema =
  jsonSchema<InterviewCoverageEvaluationOutput>(
    InterviewCoverageEvaluationOutputSchema,
  );
