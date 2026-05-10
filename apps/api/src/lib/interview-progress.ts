import type { InterviewProgressState } from "@motives-ai/contracts";
import { SKIP_QUESTION_MESSAGE } from "@motives-ai/contracts";

type TranscriptTurnLike = {
  role: "assistant" | "user";
  text: string;
};

export function isSkipQuestionText(text: string) {
  return text.trim() === SKIP_QUESTION_MESSAGE;
}

export function countAnsweredTranscriptTurns(
  transcript: TranscriptTurnLike[],
) {
  return transcript.filter(
    (message) => message.role === "user" && !isSkipQuestionText(message.text),
  ).length;
}

export function buildInterviewProgressState(
  topicLabels: string[],
  answerCount: number,
): InterviewProgressState {
  const clampedCount = Math.max(0, answerCount);
  const coveredCount =
    clampedCount <= 1 ? 0 : Math.min(clampedCount - 1, topicLabels.length);
  const activeIndex = coveredCount >= topicLabels.length ? null : coveredCount;

  return {
    activeTopicLabel:
      activeIndex === null ? null : topicLabels[activeIndex] ?? null,
    completionRatio:
      topicLabels.length === 0
        ? 0
        : Math.min(
            (coveredCount + (activeIndex !== null ? 0.5 : 1)) / topicLabels.length,
            1,
          ),
    coveredTopicLabels: topicLabels.slice(0, coveredCount),
    remainingTopicLabels: activeIndex === null ? [] : topicLabels.slice(activeIndex + 1),
  };
}

export function buildFallbackInterviewProgressState(
  topicLabels: string[],
  transcript: TranscriptTurnLike[],
) {
  return buildInterviewProgressState(
    topicLabels,
    countAnsweredTranscriptTurns(transcript),
  );
}

export function advanceInterviewProgressStateAfterSkip(
  topicLabels: string[],
  progressState: InterviewProgressState,
): InterviewProgressState {
  const coveredTopicLabels = topicLabels.filter((label) =>
    progressState.coveredTopicLabels.includes(label),
  );
  const uncoveredTopicLabels = topicLabels.filter(
    (label) => !coveredTopicLabels.includes(label),
  );

  if (uncoveredTopicLabels.length === 0) {
    return {
      activeTopicLabel: null,
      completionRatio: 1,
      coveredTopicLabels,
      remainingTopicLabels: [],
    };
  }

  const currentActiveIndex =
    typeof progressState.activeTopicLabel === "string"
      ? uncoveredTopicLabels.indexOf(progressState.activeTopicLabel)
      : -1;
  const activeTopicLabel =
    currentActiveIndex >= 0 && currentActiveIndex < uncoveredTopicLabels.length - 1
      ? uncoveredTopicLabels[currentActiveIndex + 1] ?? uncoveredTopicLabels[0] ?? null
      : progressState.activeTopicLabel && uncoveredTopicLabels.includes(progressState.activeTopicLabel)
        ? progressState.activeTopicLabel
        : uncoveredTopicLabels[0] ?? null;
  const remainingTopicLabels = uncoveredTopicLabels.filter(
    (label) => label !== activeTopicLabel,
  );

  return {
    activeTopicLabel,
    completionRatio:
      topicLabels.length === 0
        ? 0
        : Math.min(
            (coveredTopicLabels.length + (activeTopicLabel === null ? 1 : 0.25)) /
              topicLabels.length,
            1,
          ),
    coveredTopicLabels,
    remainingTopicLabels,
  };
}
