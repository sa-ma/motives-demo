import type { StudyPlan } from "@motives-ai/contracts";

import type { TranscriptTurnRow } from "../db/schema.js";
import type { SessionDebriefOutput } from "../ai/research-schemas.js";
import { isSkipQuestionText } from "./interview-progress.js";

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

export function validateGeneratedSessionDebriefOutput(input: {
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
