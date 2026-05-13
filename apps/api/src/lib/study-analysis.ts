import type {
  SessionDebrief,
  SessionDebriefResponse,
  StudyTopicCoverageItem,
} from "@motives-ai/contracts";

import type {
  DebriefReportRow,
  TranscriptTurnRow,
} from "../db/schema.js";
import type { SessionDebriefOutput } from "../ai/research-schemas.js";

function toEvidenceCount(strength: "high" | "medium" | "low" | "none", score: number) {
  if (score > 0) {
    return Math.max(1, Math.min(5, Math.round(score)));
  }

  if (strength === "high") {
    return 4;
  }

  if (strength === "medium") {
    return 3;
  }

  if (strength === "low") {
    return 1;
  }

  return 0;
}

const themeScoreByStrength = {
  high: 4,
  medium: 3,
  low: 2,
} as const;

function normalizeDebriefTheme(
  theme: SessionDebrief["summary"]["topThemes"][number],
) {
  const fallbackScore = themeScoreByStrength[theme.strength];
  const score =
    Number.isInteger(theme.score) && theme.score >= 2 && theme.score <= 4
      ? theme.score
      : fallbackScore;

  return {
    ...theme,
    label: theme.label.trim(),
    score,
  };
}

export function normalizeSessionDebriefModel(
  debrief: SessionDebrief,
): SessionDebrief {
  return {
    ...debrief,
    summary: {
      ...debrief.summary,
      topThemes: debrief.summary.topThemes.map(normalizeDebriefTheme),
    },
  };
}

export function buildStudyTopicCoverageFromDebriefs(
  planTopics: string[],
  debriefs: SessionDebrief[],
): StudyTopicCoverageItem[] {
  return planTopics.map((topic, index) => {
    const matchingTopics = debriefs
      .flatMap((debrief) => debrief.coverage.topics)
      .filter((item) => item.topic.toLowerCase() === topic.toLowerCase());

    const coveredCount = matchingTopics.filter(
      (item) => item.coverageOutcome === "covered",
    ).length;
    const inProgressCount = matchingTopics.filter(
      (item) => item.status === "in-progress",
    ).length;
    const weakCount = matchingTopics.filter(
      (item) => item.status === "weak-evidence",
    ).length;
    const evidence = matchingTopics.reduce((max, item) => Math.max(max, item.score), 0);

    let status: StudyTopicCoverageItem["status"] = "not-explored";

    if (coveredCount > 0) {
      status = "covered";
    } else if (inProgressCount > 0) {
      status = "in-progress";
    } else if (weakCount > 0) {
      status = "weak-evidence";
    }

    return {
      id: `${topic.toLowerCase().replace(/\s+/g, "-")}-${index}`,
      topic,
      status,
      evidence,
    };
  });
}

function buildEvidenceIdMap(
  transcript: TranscriptTurnRow[],
  evidence: SessionDebrief["evidence"],
) {
  const availableEvidence = [...evidence];

  return transcript.map((turn) => {
    if (turn.role !== "user") {
      return undefined;
    }

    const matchIndex = availableEvidence.findIndex(
      (item) =>
        turn.text.includes(item.quote) ||
        item.quote.includes(turn.text.slice(0, Math.min(turn.text.length, 80))),
    );

    if (matchIndex === -1) {
      return undefined;
    }

    const [match] = availableEvidence.splice(matchIndex, 1);
    return match?.id;
  });
}

export function buildSessionDebriefModel(options: {
  output: SessionDebriefOutput;
  participantLabel: string;
  sessionId: string;
  studyId: string;
  studyObjective: string;
  transcript: TranscriptTurnRow[];
}) {
  const evidence = options.output.evidence.map((item, index) => ({
    id: `evidence-${index + 1}`,
    label: item.label,
    followUp: item.followUp,
    quote: item.quote,
    theme: item.theme,
    timestamp:
      options.transcript.find(
        (turn) => turn.role === "user" && turn.text.includes(item.quote),
      )?.timestampLabel ?? options.transcript.at(-1)?.timestampLabel ?? "Now",
    whyItMatters: item.whyItMatters,
  }));
  const evidenceIdByTurn = buildEvidenceIdMap(options.transcript, evidence);

  return normalizeSessionDebriefModel({
    studyId: options.studyId,
    sessionId: options.sessionId,
    participantLabel: options.participantLabel,
    title: "Interview Debrief",
    subtitle: `AI debrief for ${options.participantLabel}`,
    summary: {
      keyTakeaway: options.output.keyTakeaway,
      topThemes: options.output.topThemes,
      evidenceIds: evidence.map((item) => item.id),
      recommendedFollowUp: options.output.recommendedFollowUp,
      whyThisMatters: options.output.whyThisMatters,
    },
    evidence,
    transcript: options.transcript.map((turn, index) => ({
      id: turn.id,
      timestamp: turn.timestampLabel,
      speaker: turn.role === "assistant" ? "ai" : "participant",
      speakerLabel: turn.role === "assistant" ? "AI Interviewer" : "Participant",
      text: turn.text,
      evidenceId: evidenceIdByTurn[index],
    })),
    coverage: {
      researchObjective: options.studyObjective,
      topics: options.output.topicCoverage.map((topic, index) => ({
        coverageOutcome: topic.coverageOutcome,
        id: `${options.sessionId}-${index}`,
        topic: topic.topic,
        status: topic.status,
        evidenceStrength: topic.evidenceStrength,
        score: toEvidenceCount(topic.evidenceStrength, topic.score),
      })),
      missedAreas: options.output.missedAreas,
      interviewQuality: options.output.interviewQuality,
    },
    reasoning: options.output.reasoning.map((row, index) => ({
      id: `reasoning-${index + 1}`,
      timestamp: row.timestamp,
      trigger: row.trigger,
      aiDecision: row.aiDecision,
      researchPurpose: row.researchPurpose,
      status: row.status,
    })),
  } satisfies SessionDebrief);
}

export function debriefResponseFromRow(
  row: DebriefReportRow,
): SessionDebriefResponse {
  return {
    status: "ready",
    debrief: normalizeSessionDebriefModel(row.content),
  };
}
