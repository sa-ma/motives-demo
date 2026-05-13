import type { StudyPlan } from "@motives-ai/contracts";

import type { TranscriptTurnRow } from "../db/schema.js";
import type { SessionDebriefOutput } from "../ai/research-schemas.js";
import { isSkipQuestionText } from "./interview-progress.js";
import type { InterviewCoverageState } from "./interview-coverage.js";

export class InvalidGeneratedSessionDebriefError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidGeneratedSessionDebriefError";
  }
}

function normalizeText(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function getSubstantiveParticipantTurns(transcript: TranscriptTurnRow[]) {
  return transcript.filter(
    (turn) => turn.role === "user" && !isSkipQuestionText(turn.text),
  );
}

function validateCoverageRubric(
  topicCoverage: SessionDebriefOutput["topicCoverage"],
) {
  for (const item of topicCoverage) {
    const score = Math.round(item.score);

    if (score !== item.score || score < 0 || score > 5) {
      throw new InvalidGeneratedSessionDebriefError(
        `Topic coverage score for "${item.topic}" must be an integer between 0 and 5.`,
      );
    }

    if (item.status === "not-explored") {
      if (item.evidenceStrength !== "none" || score !== 0) {
        throw new InvalidGeneratedSessionDebriefError(
          `Topic "${item.topic}" cannot be marked not-explored with evidence.`,
        );
      }
      continue;
    }

    if (item.status === "weak-evidence") {
      if (item.evidenceStrength !== "low" || score !== 1) {
        throw new InvalidGeneratedSessionDebriefError(
          `Topic "${item.topic}" must use low evidence strength and score 1 when marked weak-evidence.`,
        );
      }
      continue;
    }

    if (item.status === "in-progress") {
      if (item.evidenceStrength !== "medium" || score < 2 || score > 3) {
        throw new InvalidGeneratedSessionDebriefError(
          `Topic "${item.topic}" must use medium evidence strength and score 2-3 when marked in-progress.`,
        );
      }
      continue;
    }

    if (item.evidenceStrength === "none" || score < 4) {
      throw new InvalidGeneratedSessionDebriefError(
        `Topic "${item.topic}" must have strong enough evidence to be marked covered.`,
      );
    }
  }
}

function validateTopThemes(topThemes: SessionDebriefOutput["topThemes"]) {
  const expectedScores = {
    high: 4,
    medium: 3,
    low: 2,
  } as const;

  for (const theme of topThemes) {
    const label = theme.label.trim();

    if (label.length < 3 || label.length > 60) {
      throw new InvalidGeneratedSessionDebriefError(
        `Top theme "${theme.label}" must be a short label between 3 and 60 characters.`,
      );
    }

    if (!Number.isInteger(theme.score) || theme.score < 2 || theme.score > 4) {
      throw new InvalidGeneratedSessionDebriefError(
        `Top theme "${theme.label}" must use an integer score between 2 and 4.`,
      );
    }

    if (theme.score !== expectedScores[theme.strength]) {
      throw new InvalidGeneratedSessionDebriefError(
        `Top theme "${theme.label}" must use score ${expectedScores[theme.strength]} when strength is ${theme.strength}.`,
      );
    }
  }
}

export function validateGeneratedSessionDebriefOutput(input: {
  coverageState: InterviewCoverageState;
  output: SessionDebriefOutput;
  plan: StudyPlan;
  transcript: TranscriptTurnRow[];
}) {
  const planTopics = input.plan.topics.map((topic) => topic.trim());
  const outputTopics = input.output.topicCoverage.map((item) => item.topic.trim());

  if (outputTopics.length !== planTopics.length) {
    throw new InvalidGeneratedSessionDebriefError(
      "Debrief topic coverage must include every approved plan topic exactly once.",
    );
  }

  for (let index = 0; index < planTopics.length; index += 1) {
    if (outputTopics[index]?.toLowerCase() !== planTopics[index]?.toLowerCase()) {
      throw new InvalidGeneratedSessionDebriefError(
        "Debrief topic coverage must preserve the approved topic list and order.",
      );
    }
  }

  validateCoverageRubric(input.output.topicCoverage);
  validateTopThemes(input.output.topThemes);

  const coverageTopicsByLabel = new Map(
    input.coverageState.topics.map((topic) => [
      topic.topicLabel.toLowerCase(),
      topic.status === "covered" ? "covered" : "not-covered",
    ]),
  );

  for (const topic of input.output.topicCoverage) {
    const expectedCoverageOutcome = coverageTopicsByLabel.get(topic.topic.toLowerCase());

    if (expectedCoverageOutcome !== topic.coverageOutcome) {
      throw new InvalidGeneratedSessionDebriefError(
        `Topic "${topic.topic}" must preserve the canonical coverage outcome.`,
      );
    }
  }

  const participantTurns = getSubstantiveParticipantTurns(input.transcript);
  const normalizedParticipantTurns = participantTurns.map((turn) =>
    normalizeText(turn.text),
  );

  for (const evidence of input.output.evidence) {
    const normalizedQuote = normalizeText(evidence.quote);

    if (
      normalizedQuote.length === 0 ||
      !normalizedParticipantTurns.some(
        (turn) => turn.includes(normalizedQuote) || normalizedQuote.includes(turn),
      )
    ) {
      throw new InvalidGeneratedSessionDebriefError(
        `Evidence quote "${evidence.quote}" is not grounded in a participant response.`,
      );
    }
  }
}

export function hasSubstantiveParticipantResponses(transcript: TranscriptTurnRow[]) {
  return getSubstantiveParticipantTurns(transcript).length > 0;
}
