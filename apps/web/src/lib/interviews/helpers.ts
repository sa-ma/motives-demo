import type {
  InterviewMessage,
  InterviewProgressState,
  InterviewSessionStatus,
  InterviewStep,
  InterviewUIMessage,
} from "@/lib/interviews/types";

export function getInterviewPath(
  inviteCode: string,
  step: InterviewSessionStatus | InterviewStep,
) {
  return `/interviews/${inviteCode}/${step}`;
}

export function getRedirectPathForStep(
  inviteCode: string,
  currentStatus: InterviewSessionStatus,
  requestedStep: InterviewStep,
) {
  if (currentStatus === "expired") {
    return null;
  }

  if (currentStatus === requestedStep) {
    return null;
  }

  return getInterviewPath(inviteCode, currentStatus);
}

export function buildInterviewProgressState(
  topicLabels: string[],
  answerCount: number,
): InterviewProgressState {
  const clampedCount = Math.max(0, answerCount);
  const coveredCount =
    clampedCount <= 1 ? 0 : Math.min(clampedCount - 1, topicLabels.length);
  const activeIndex =
    coveredCount >= topicLabels.length ? null : coveredCount;

  return {
    activeTopicLabel:
      activeIndex === null ? null : topicLabels[activeIndex] ?? null,
    completionRatio:
      topicLabels.length === 0
        ? 0
        : Math.min((coveredCount + (activeIndex !== null ? 0.5 : 1)) / topicLabels.length, 1),
    coveredTopicLabels: topicLabels.slice(0, coveredCount),
    remainingTopicLabels:
      activeIndex === null ? [] : topicLabels.slice(activeIndex + 1),
  };
}

export function toInterviewUIMessage(
  message: InterviewMessage,
): InterviewUIMessage {
  return {
    id: message.id,
    metadata: {
      assistantTurnId: message.role === "assistant" ? message.id : undefined,
      timestampLabel: message.timestampLabel,
    },
    parts: [
      {
        state: "done",
        text: message.text,
        type: "text",
      },
    ],
    role: message.role,
  };
}
