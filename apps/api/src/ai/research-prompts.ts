import type {
  ParticipantResponses,
  StudyPlan,
} from "@motives-ai/contracts";

import type {
  SessionAnnotationRow,
  StudyRow,
  TranscriptTurnRow,
} from "../db/schema.js";
import { isSkipQuestionText } from "../lib/interview-progress.js";
import type { SessionDebrief } from "@motives-ai/contracts/studies";

function formatOrderedList(items: string[]) {
  if (items.length === 0) {
    return "None";
  }

  return items.map((item, index) => `${index + 1}. ${item}`).join("\n");
}

function formatParticipantResponses(responses: ParticipantResponses) {
  const entries = Object.entries(responses);

  if (entries.length === 0) {
    return "No participant profile details were captured.";
  }

  return entries.map(([key, value]) => `- ${key}: ${String(value)}`).join("\n");
}

function formatTranscript(transcript: TranscriptTurnRow[]) {
  if (transcript.length === 0) {
    return "No transcript available.";
  }

  return transcript
    .map((turn) => {
      const speaker = turn.role === "assistant" ? "Interviewer" : "Participant";
      const text =
        turn.role === "user" && isSkipQuestionText(turn.text)
          ? "[Participant skipped the previous question]"
          : turn.text;

      return `[${turn.timestampLabel}] ${speaker}: ${text}`;
    })
    .join("\n");
}

function formatAnnotations(annotations: SessionAnnotationRow[]) {
  if (annotations.length === 0) {
    return "No turn annotations available.";
  }

  return annotations
    .map((annotation, index) => {
      return [
        `Turn ${index + 1}`,
        `- emotion: ${annotation.emotionSignal}`,
        `- covered: ${annotation.progressState.coveredTopicLabels.join(", ") || "None"}`,
        `- active: ${annotation.progressState.activeTopicLabel ?? "None"}`,
        `- evidence: ${annotation.evidenceQuotes.join(" | ") || "None"}`,
        `- contradictions: ${annotation.contradictions.join(" | ") || "None"}`,
      ].join("\n");
    })
    .join("\n\n");
}

export function buildStudyPlanPrompt(input: {
  study: StudyRow;
  topics: string[];
}) {
  return [
    "You are a senior UX researcher writing an interview guide for an AI-led interview product.",
    "Generate a plan that is concrete, practical, and clearly usable by a live interviewer.",
    "Every hypothesis and topic must be specific to the study objective, audience, and context.",
    "Do not produce generic research filler.",
    "Use the provided starting topics as anchors, but refine and expand them where useful.",
    "The opening question should be a single natural, non-leading question and must end with a question mark.",
    "Every list item must contain exactly one idea.",
    "Every example probe must be a single standalone question, not a combined list of questions, and every example probe must end with a question mark.",
    "Do not include JSON fragments, field names, markdown, repair notes, or commentary inside any string value.",
    "If you notice a formatting mistake, silently fix it and return a clean object rather than explaining the mistake.",
    "Return exactly 4 to 6 hypotheses.",
    "Return exactly 5 to 8 topics.",
    "Return exactly 4 to 6 probing strategy items.",
    "Return exactly 5 to 8 example probes.",
    "Return exactly 5 to 8 must-cover areas.",
    "Return exactly 4 to 6 things to avoid.",
    "Selected behavior should be the single behavior mode that best fits the study.",
    "Selected tone should be short, specific, and no more than a few words.",
    "Return only structured data that matches the schema.",
    "",
    `Study title: ${input.study.title}`,
    `Objective: ${input.study.objective}`,
    `Audience: ${input.study.audience}`,
    `Context: ${input.study.context}`,
    "Seed topics:",
    formatOrderedList(input.topics),
  ].join("\n");
}

export function buildSessionDebriefPrompt(input: {
  annotations: SessionAnnotationRow[];
  participantLabel: string;
  participantResponses: ParticipantResponses;
  plan: StudyPlan;
  study: StudyRow;
  transcript: TranscriptTurnRow[];
}) {
  return [
    "You are producing a research debrief for a single completed interview.",
    "The output will be shown directly to a researcher, so it must be specific, evidence-based, and grounded in the transcript.",
    "Do not invent quotes or themes that are not supported by the transcript.",
    "Use short verbatim evidence quotes wherever possible.",
    "Every evidence quote must come directly from a participant response in the transcript.",
    "Reasoning rows should explain how the AI interviewer adapted over the course of the interview.",
    "Topic coverage must use only the approved plan topics.",
    "Use this strict topic coverage rubric:",
    "- covered: the topic was clearly answered with direct evidence; use score 4 or 5 and evidenceStrength high or medium.",
    "- in-progress: the topic has partial but incomplete evidence; use score 2 or 3 and evidenceStrength medium.",
    "- weak-evidence: the topic was only hinted at indirectly or briefly; use score 1 and evidenceStrength low.",
    "- not-explored: the topic was not meaningfully discussed; use score 0 and evidenceStrength none.",
    "Do not mix status, score, and evidenceStrength inconsistently.",
    "Skipped questions do not count as evidence for topic coverage.",
    "If the participant did not answer a topic, mark it not-explored with score 0.",
    "Return only structured data that matches the schema.",
    "",
    `Study title: ${input.study.title}`,
    `Study objective: ${input.study.objective}`,
    `Audience: ${input.study.audience}`,
    `Participant label: ${input.participantLabel}`,
    "",
    "Approved plan topics:",
    formatOrderedList(input.plan.topics),
    "",
    "Must-cover areas:",
    formatOrderedList(input.plan.mustCoverAreas),
    "",
    "Hypotheses:",
    formatOrderedList(input.plan.hypotheses),
    "",
    "Participant profile:",
    formatParticipantResponses(input.participantResponses),
    "",
    "Turn annotations:",
    formatAnnotations(input.annotations),
    "",
    "Full transcript:",
    formatTranscript(input.transcript),
  ].join("\n");
}

export function buildStudyAggregatePrompt(input: {
  debriefs: SessionDebrief[];
  plan: StudyPlan;
  study: StudyRow;
}) {
  const debriefSummaries = input.debriefs
    .map((debrief, index) =>
      [
        `Session ${index + 1}: ${debrief.participantLabel}`,
        `- key takeaway: ${debrief.summary.keyTakeaway}`,
        `- top themes: ${debrief.summary.topThemes.map((theme) => theme.label).join(", ") || "None"}`,
        `- why this matters: ${debrief.summary.whyThisMatters}`,
      ].join("\n"),
    )
    .join("\n\n");

  return [
    "You are synthesizing multiple interview debriefs into a study-level research observation.",
    "Focus on the strongest recurring patterns, not one-off anecdotes.",
    "Keep the observation concise but specific.",
    "Themes should be short labels that can appear in the study overview UI.",
    "Use only evidence already present in the debriefs.",
    "Return only structured data that matches the schema.",
    "",
    `Study title: ${input.study.title}`,
    `Study objective: ${input.study.objective}`,
    "Approved plan topics:",
    formatOrderedList(input.plan.topics),
    "",
    "Session debrief summaries:",
    debriefSummaries || "No completed debriefs yet.",
  ].join("\n");
}
