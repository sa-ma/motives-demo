import type { UIMessage } from "ai";

export type {
  InterviewInvitePayload,
  InterviewMessage,
  InterviewMessageMetadata,
  InterviewProgressState,
  InterviewSessionState,
  InterviewSessionStatus,
  InterviewStep,
  ParticipantFieldOption,
  ParticipantIntakeField,
  ParticipantResponses,
  PublicInterviewActionInput,
  PublicInterviewActionResponse,
  PublicInterviewRouteState as InterviewRouteState,
} from "@motives-ai/contracts";

export type InterviewUIMessage = UIMessage<import("@motives-ai/contracts").InterviewMessageMetadata>;
