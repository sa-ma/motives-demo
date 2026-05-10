import type { UIMessage } from "ai";

export type {
  InterviewInvitePayload,
  InterviewMessage,
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

export type InterviewUIMessage = UIMessage<{
  timestampLabel?: string;
}>;
