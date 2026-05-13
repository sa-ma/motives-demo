import { Type, type Static } from "@sinclair/typebox";

export const SKIP_QUESTION_MESSAGE = "Let's skip this question.";

export const ParticipantResponseValueSchema = Type.Union([
  Type.String(),
  Type.Boolean(),
]);

export const ParticipantResponsesSchema = Type.Record(
  Type.String(),
  ParticipantResponseValueSchema,
);

export type ParticipantResponses = Static<typeof ParticipantResponsesSchema>;

export const ParticipantFieldOptionSchema = Type.Object({
  label: Type.String(),
  value: Type.String(),
});

export type ParticipantFieldOption = Static<typeof ParticipantFieldOptionSchema>;

export const ParticipantIntakeFieldSchema = Type.Object({
  id: Type.String(),
  label: Type.String(),
  type: Type.Union([
    Type.Literal("text"),
    Type.Literal("select"),
    Type.Literal("radio"),
    Type.Literal("checkbox"),
  ]),
  options: Type.Optional(Type.Array(ParticipantFieldOptionSchema)),
  required: Type.Optional(Type.Boolean()),
  placeholder: Type.Optional(Type.String()),
  helperText: Type.Optional(Type.String()),
});

export type ParticipantIntakeField = Static<typeof ParticipantIntakeFieldSchema>;

export const InterviewSessionStatusSchema = Type.Union([
  Type.Literal("welcome"),
  Type.Literal("details"),
  Type.Literal("preparing"),
  Type.Literal("room"),
  Type.Literal("complete"),
  Type.Literal("expired"),
]);

export type InterviewSessionStatus = Static<typeof InterviewSessionStatusSchema>;

export const InterviewStepSchema = Type.Union([
  Type.Literal("welcome"),
  Type.Literal("details"),
  Type.Literal("preparing"),
  Type.Literal("room"),
  Type.Literal("complete"),
]);

export type InterviewStep = Static<typeof InterviewStepSchema>;

export const InterviewInvitePayloadSchema = Type.Object({
  consentCopy: Type.String(),
  estimatedDuration: Type.String(),
  formatLabel: Type.String(),
  introCopy: Type.String(),
  inviteCode: Type.String(),
  participantFields: Type.Array(ParticipantIntakeFieldSchema),
  studyTitle: Type.String(),
  topicLabels: Type.Array(Type.String()),
});

export type InterviewInvitePayload = Static<typeof InterviewInvitePayloadSchema>;

export const InterviewMessageSchema = Type.Object({
  id: Type.String(),
  role: Type.Union([Type.Literal("assistant"), Type.Literal("user")]),
  text: Type.String(),
  timestampLabel: Type.String(),
});

export type InterviewMessage = Static<typeof InterviewMessageSchema>;

export const InterviewProgressStateSchema = Type.Object({
  activeTopicLabel: Type.Union([Type.String(), Type.Null()]),
  completionRatio: Type.Number(),
  coveragePendingReview: Type.Optional(Type.Boolean()),
  coveredTopicLabels: Type.Array(Type.String()),
  remainingTopicLabels: Type.Array(Type.String()),
});

export type InterviewProgressState = Static<typeof InterviewProgressStateSchema>;

export const InterviewMessageMetadataSchema = Type.Object(
  {
    assistantTurnId: Type.Optional(Type.String()),
    progressState: Type.Optional(InterviewProgressStateSchema),
    timestampLabel: Type.Optional(Type.String()),
  },
  { additionalProperties: false },
);

export type InterviewMessageMetadata = Static<typeof InterviewMessageMetadataSchema>;

export const InterviewSessionStateSchema = Type.Object({
  inviteCode: Type.String(),
  participantResponses: ParticipantResponsesSchema,
  progressState: InterviewProgressStateSchema,
  sessionStatus: InterviewSessionStatusSchema,
  transcript: Type.Array(InterviewMessageSchema),
});

export type InterviewSessionState = Static<typeof InterviewSessionStateSchema>;

export const InvalidInterviewRouteStateSchema = Type.Object({
  inviteCode: Type.String(),
  kind: Type.Literal("invalid"),
});

export const ExpiredInterviewRouteStateSchema = Type.Object({
  invite: InterviewInvitePayloadSchema,
  kind: Type.Literal("expired"),
});

export const UnavailableInterviewReasonSchema = Type.Union([
  Type.Literal("active-cap-reached"),
  Type.Literal("study-closed"),
  Type.Literal("target-reached"),
]);

export type UnavailableInterviewReason = Static<typeof UnavailableInterviewReasonSchema>;

export const UnavailableInterviewRouteStateSchema = Type.Object({
  invite: InterviewInvitePayloadSchema,
  kind: Type.Literal("unavailable"),
  reason: UnavailableInterviewReasonSchema,
});

export const InviteReadyInterviewRouteStateSchema = Type.Object({
  invite: InterviewInvitePayloadSchema,
  kind: Type.Literal("invite-ready"),
});

export const ReadyInterviewRouteStateSchema = Type.Object({
  invite: InterviewInvitePayloadSchema,
  kind: Type.Literal("ready"),
  session: InterviewSessionStateSchema,
});

export const PublicInterviewRouteStateSchema = Type.Union([
  InvalidInterviewRouteStateSchema,
  ExpiredInterviewRouteStateSchema,
  UnavailableInterviewRouteStateSchema,
  InviteReadyInterviewRouteStateSchema,
  ReadyInterviewRouteStateSchema,
]);

export type PublicInterviewRouteState = Static<typeof PublicInterviewRouteStateSchema>;

export const PublicInterviewActionInputSchema = Type.Object(
  {
    action: Type.Union([
      Type.Literal("advance-to-details"),
      Type.Literal("submit-details"),
      Type.Literal("start-room"),
      Type.Literal("complete"),
    ]),
    participantResponses: Type.Optional(ParticipantResponsesSchema),
    consentAccepted: Type.Optional(Type.Boolean()),
  },
  { additionalProperties: false },
);

export type PublicInterviewActionInput = Static<typeof PublicInterviewActionInputSchema>;

export const PublicInterviewActionResponseSchema = Type.Object({
  ok: Type.Literal(true),
  participantResponses: ParticipantResponsesSchema,
  sessionStatus: InterviewSessionStatusSchema,
});

export type PublicInterviewActionResponse = Static<typeof PublicInterviewActionResponseSchema>;

export const PublicInterviewChatEventSchema = Type.Union([
  Type.Literal("answer"),
  Type.Literal("skip-question"),
]);

export type PublicInterviewChatEvent = Static<typeof PublicInterviewChatEventSchema>;

export const PublicInterviewChatMessageSchema = Type.Object(
  {
    id: Type.String(),
    parts: Type.Array(
      Type.Object(
        {
          type: Type.String(),
        },
        { additionalProperties: true },
      ),
    ),
    role: Type.Literal("user"),
  },
  { additionalProperties: true },
);

export type PublicInterviewChatMessage = Static<typeof PublicInterviewChatMessageSchema>;

export const PublicInterviewChatInputSchema = Type.Object(
  {
    event: Type.Optional(PublicInterviewChatEventSchema),
    id: Type.String(),
    message: PublicInterviewChatMessageSchema,
  },
  { additionalProperties: false },
);

export type PublicInterviewChatInput = Static<typeof PublicInterviewChatInputSchema>;
