import { Type, type Static } from "@sinclair/typebox";

import type { InterviewProgressState } from "@motives-ai/contracts";

export const InterviewCoverageTopicStatusSchema = Type.Union([
  Type.Literal("not-started"),
  Type.Literal("active"),
  Type.Literal("covered"),
]);

export type InterviewCoverageTopicStatus = Static<
  typeof InterviewCoverageTopicStatusSchema
>;

export const InterviewCoverageTopicStateSchema = Type.Object(
  {
    status: InterviewCoverageTopicStatusSchema,
    topicLabel: Type.String(),
  },
  { additionalProperties: false },
);

export type InterviewCoverageTopicState = Static<
  typeof InterviewCoverageTopicStateSchema
>;

export const InterviewCoverageStateSchema = Type.Object(
  {
    activeTopicIndex: Type.Union([Type.Integer({ minimum: 0 }), Type.Null()]),
    coveragePendingReview: Type.Boolean(),
    interviewComplete: Type.Boolean(),
    topics: Type.Array(InterviewCoverageTopicStateSchema),
  },
  { additionalProperties: false },
);

export type InterviewCoverageState = Static<typeof InterviewCoverageStateSchema>;

export function createInitialCoverageState(
  topicLabels: string[],
): InterviewCoverageState {
  return {
    activeTopicIndex: topicLabels.length > 0 ? 0 : null,
    coveragePendingReview: false,
    interviewComplete: topicLabels.length === 0,
    topics: topicLabels.map((topicLabel, index) => ({
      status: index === 0 ? "active" : "not-started",
      topicLabel,
    })),
  };
}

function getTopicStateMap(coverageState: InterviewCoverageState) {
  return new Map(
    coverageState.topics.map((topic) => [topic.topicLabel.toLowerCase(), topic]),
  );
}

export function normalizeCoverageState(
  topicLabels: string[],
  coverageState: InterviewCoverageState,
): InterviewCoverageState {
  const topicStateMap = getTopicStateMap(coverageState);
  const topics: InterviewCoverageTopicState[] = topicLabels.map((topicLabel) => {
    const existing = topicStateMap.get(topicLabel.toLowerCase());

    return {
      status: existing?.status === "covered" ? "covered" : "not-started",
      topicLabel,
    };
  });

  const allCovered = topics.every((topic) => topic.status === "covered");

  if (allCovered) {
    return {
      activeTopicIndex: null,
      coveragePendingReview: coverageState.coveragePendingReview,
      interviewComplete: true,
      topics,
    };
  }

  const requestedActiveIndex =
    typeof coverageState.activeTopicIndex === "number" &&
    coverageState.activeTopicIndex >= 0 &&
    coverageState.activeTopicIndex < topics.length &&
    topics[coverageState.activeTopicIndex]?.status !== "covered"
      ? coverageState.activeTopicIndex
      : null;
  const firstUncoveredIndex = topics.findIndex((topic) => topic.status !== "covered");
  const activeTopicIndex =
    requestedActiveIndex ?? (firstUncoveredIndex >= 0 ? firstUncoveredIndex : null);

  if (activeTopicIndex !== null) {
    topics[activeTopicIndex] = {
      ...topics[activeTopicIndex],
      status: "active",
    };
  }

  return {
    activeTopicIndex,
    coveragePendingReview: coverageState.coveragePendingReview,
    interviewComplete: false,
    topics,
  };
}

export function deriveProgressStateFromCoverageState(
  coverageState: InterviewCoverageState,
): InterviewProgressState {
  const coveredTopicLabels = coverageState.topics
    .filter((topic) => topic.status === "covered")
    .map((topic) => topic.topicLabel);
  const activeTopicLabel =
    typeof coverageState.activeTopicIndex === "number"
      ? coverageState.topics[coverageState.activeTopicIndex]?.topicLabel ?? null
      : null;
  const remainingTopicLabels = coverageState.topics
    .filter(
      (topic, index) =>
        topic.status !== "covered" && index !== coverageState.activeTopicIndex,
    )
    .map((topic) => topic.topicLabel);
  const topicCount = coverageState.topics.length;
  let completionRatio = 0;

  if (topicCount > 0) {
    if (coverageState.interviewComplete) {
      completionRatio = coveredTopicLabels.length / topicCount;
    } else if (activeTopicLabel !== null) {
      completionRatio = (coveredTopicLabels.length + 0.5) / topicCount;
    } else {
      completionRatio = coveredTopicLabels.length / topicCount;
    }
  }

  return {
    activeTopicLabel,
    completionRatio: Math.max(0, Math.min(completionRatio, 1)),
    coveragePendingReview: coverageState.coveragePendingReview,
    coveredTopicLabels,
    remainingTopicLabels,
  };
}

export function advanceCoverageStateAfterSkip(
  coverageState: InterviewCoverageState,
): InterviewCoverageState {
  const normalized = normalizeCoverageState(
    coverageState.topics.map((topic) => topic.topicLabel),
    coverageState,
  );

  if (normalized.interviewComplete || normalized.activeTopicIndex === null) {
    return normalized;
  }

  const nextTopicIndex = normalized.topics.findIndex(
    (topic, index) =>
      index > (normalized.activeTopicIndex ?? -1) && topic.status !== "covered",
  );

  if (nextTopicIndex === -1) {
    return normalized;
  }

  const topics = normalized.topics.map((topic, index) => {
    if (index === normalized.activeTopicIndex) {
      return {
        ...topic,
        status: "not-started",
      } satisfies InterviewCoverageTopicState;
    }

    if (index === nextTopicIndex) {
      return {
        ...topic,
        status: "active",
      } satisfies InterviewCoverageTopicState;
    }

    return topic;
  });

  return {
    activeTopicIndex: nextTopicIndex,
    coveragePendingReview: false,
    interviewComplete: false,
    topics,
  };
}

export function markCoverageStatePendingReview(
  coverageState: InterviewCoverageState,
): InterviewCoverageState {
  return {
    ...coverageState,
    coveragePendingReview: true,
  };
}

export function countCoveredTopics(coverageState: InterviewCoverageState) {
  return coverageState.topics.filter((topic) => topic.status === "covered").length;
}
