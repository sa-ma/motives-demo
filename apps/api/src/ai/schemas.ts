import { jsonSchema } from "ai";
import { Type, type Static } from "@sinclair/typebox";

import { InterviewProgressStateSchema } from "@motives-ai/contracts/public-interviews";

export const interviewProgressStateJsonSchema =
  jsonSchema<Static<typeof InterviewProgressStateSchema>>(InterviewProgressStateSchema);

export const SessionAnnotationOutputSchema = Type.Object(
  {
    contradictions: Type.Array(Type.String()),
    emotionSignal: Type.Union([
      Type.Literal("low"),
      Type.Literal("medium"),
      Type.Literal("high"),
    ]),
    evidenceQuotes: Type.Array(Type.String(), {
      maxItems: 3,
    }),
    progressState: InterviewProgressStateSchema,
  },
  { additionalProperties: false },
);

export type SessionAnnotationOutput = Static<typeof SessionAnnotationOutputSchema>;

export const sessionAnnotationOutputJsonSchema =
  jsonSchema<SessionAnnotationOutput>(SessionAnnotationOutputSchema);
