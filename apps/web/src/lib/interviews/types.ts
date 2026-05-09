import type { UIMessage } from "ai";

export type ParticipantFieldOption = {
  label: string;
  value: string;
};

export type ParticipantIntakeField = {
  id: string;
  label: string;
  type: "text" | "select" | "radio" | "checkbox";
  options?: ParticipantFieldOption[];
  required?: boolean;
  placeholder?: string;
  helperText?: string;
};

export type InterviewSessionStatus =
  | "welcome"
  | "details"
  | "preparing"
  | "room"
  | "complete"
  | "expired";

export type InterviewStep =
  | "welcome"
  | "details"
  | "preparing"
  | "room"
  | "complete";

export type InterviewInvitePayload = {
  consentCopy: string;
  estimatedDuration: string;
  formatLabel: string;
  introCopy: string;
  inviteCode: string;
  participantFields: ParticipantIntakeField[];
  sessionStatus: InterviewSessionStatus;
  studyTitle: string;
  topicLabels: string[];
};

export type InterviewMessage = {
  id: string;
  role: "assistant" | "user";
  text: string;
  timestampLabel: string;
};

export type InterviewProgressState = {
  activeTopicLabel: string | null;
  completionRatio: number;
  coveredTopicLabels: string[];
  remainingTopicLabels: string[];
};

export type InterviewSessionState = {
  inviteCode: string;
  participantResponses: Record<string, boolean | string>;
  progressState: InterviewProgressState;
  sessionStatus: InterviewSessionStatus;
  transcript: InterviewMessage[];
};

export type InterviewRouteState =
  | {
      inviteCode: string;
      kind: "invalid";
    }
  | {
      invite: InterviewInvitePayload;
      kind: "expired";
    }
  | {
      invite: InterviewInvitePayload;
      kind: "ready";
      session: InterviewSessionState;
    };

export type InterviewUIMessage = UIMessage<{
  timestampLabel?: string;
}>;
