import { Type, type Static } from "@sinclair/typebox";

export const CreateInviteInputSchema = Type.Object({}, { additionalProperties: false });

export type CreateInviteInput = Static<typeof CreateInviteInputSchema>;

export const CreateInviteResponseSchema = Type.Object({
  inviteCode: Type.String(),
  inviteUrl: Type.String(),
  expiresAt: Type.String(),
  sessionId: Type.String(),
});

export type CreateInviteResponse = Static<typeof CreateInviteResponseSchema>;

