import { Type, type Static } from "@sinclair/typebox";

export const HttpErrorDetailSchema = Type.Object(
  {
    field: Type.String(),
    message: Type.String(),
  },
  { additionalProperties: false },
);

export type HttpErrorDetail = Static<typeof HttpErrorDetailSchema>;

export const HttpErrorSchema = Type.Object(
  {
    code: Type.String(),
    statusCode: Type.Integer(),
    error: Type.String(),
    message: Type.String(),
    details: Type.Optional(Type.Array(HttpErrorDetailSchema)),
  },
  { additionalProperties: false },
);

export type HttpErrorResponse = Static<typeof HttpErrorSchema>;

export const commonErrorResponses = {
  "4xx": HttpErrorSchema,
  "5xx": HttpErrorSchema,
} as const;
