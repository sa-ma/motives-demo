import type {
  InterviewProgressState,
  ParticipantResponses,
  PublicInterviewChatEvent,
  StudyPlan,
} from "@motives-ai/contracts";

import type { StudyRow, TranscriptTurnRow } from "../db/schema.js";
import { isSkipQuestionText } from "../lib/interview-progress.js";

const behaviorGuidance: Record<StudyPlan["selectedBehaviorId"], string> = {
  "ask-for-examples":
    "Prefer specific recent examples over general opinions. If the participant speaks abstractly, ask what happened in a concrete instance.",
  "avoid-leading-questions":
    "Keep questions open-ended and neutral. Do not suggest causes, feelings, or preferred answers inside the question itself.",
  "challenge-contradictions":
    "If the participant says something that conflicts with an earlier point, gently surface the inconsistency and invite them to clarify it.",
  "probe-emotional-language":
    "When the participant uses emotional language, briefly reflect it and ask what made that moment feel that way or why it mattered.",
  "stay-neutral":
    "Stay especially neutral and non-judgmental. Avoid affirming or framing the participant's experience for them.",
};

function formatParticipantResponses(responses: ParticipantResponses) {
  const entries = Object.entries(responses);

  if (entries.length === 0) {
    return "No participant profile details have been collected yet.";
  }

  return entries
    .map(([key, value]) => `- ${key}: ${String(value)}`)
    .join("\n");
}

function formatTranscript(transcript: TranscriptTurnRow[]) {
  return transcript
    .slice(-8)
    .map((turn) => {
      const speaker = turn.role === "assistant" ? "Interviewer" : "Participant";
      const text =
        turn.role === "user" && isSkipQuestionText(turn.text)
          ? "Skipped the previous question."
          : turn.text;

      return `${speaker}: ${text}`;
    })
    .join("\n");
}

function formatOrderedList(items: string[]) {
  if (items.length === 0) {
    return "None";
  }

  return items.map((item, index) => `${index + 1}. ${item}`).join("\n");
}

function formatProgressState(progressState: InterviewProgressState) {
  return [
    `Active topic: ${progressState.activeTopicLabel ?? "None"}`,
    `Covered topics: ${progressState.coveredTopicLabels.join(", ") || "None"}`,
    `Remaining topics: ${progressState.remainingTopicLabels.join(", ") || "None"}`,
    `Completion ratio: ${progressState.completionRatio}`,
  ].join("\n");
}

export function buildInterviewerSystemPrompt(input: {
  event?: PublicInterviewChatEvent;
  participantResponses: ParticipantResponses;
  plan: StudyPlan;
  progressState: InterviewProgressState;
  study: StudyRow;
  transcript: TranscriptTurnRow[];
}) {
  const transcriptTail = formatTranscript(input.transcript);
  const participantProfile = formatParticipantResponses(input.participantResponses);
  const activeTopic = input.progressState.activeTopicLabel ?? "None";
  const remainingTopics =
    input.progressState.remainingTopicLabels.length > 0
      ? input.progressState.remainingTopicLabels.join(", ")
      : "None";
  const skipInstruction =
    input.event === "skip-question"
      ? "The participant explicitly asked to skip the last question. Acknowledge that briefly and move to the next relevant topic instead of rephrasing the same question."
      : "The participant answered normally. Follow up based on their latest answer and the approved plan.";

  return [
    "You are an expert qualitative researcher conducting a live text interview from an approved interview plan.",
    "Your job is to follow that plan closely and ask one concise, natural next question at a time.",
    "Do not ask generic filler questions that are not clearly tied to the study objective, hypotheses, or remaining plan topics.",
    "Do not use bullet points, labels, or explain your process.",
    "Keep each response short: usually one question, at most two short paragraphs.",
    "Stay warm, observant, and grounded in the participant's language.",
    "If the participant shares something emotionally charged, respond with empathy before probing further.",
    "Prefer concrete follow-up questions and examples over abstract questions.",
    "Use the ordered topics as your internal agenda. Prefer moving through them in order unless the participant's answer clearly provides evidence for a later topic.",
    "Use the active topic as your main focus. Once the participant has given a concrete reason, example, or outcome for that topic, move to the next remaining topic instead of asking endless follow-ups.",
    "Ask at most one targeted follow-up before transitioning, unless the participant's answer is still too vague to capture usable evidence.",
    "If all plan topics are already covered, do not ask another substantive question. Briefly thank the participant, say you have covered everything you needed, and invite them to end the interview.",
    "Do not mention internal plan mechanics, coverage state, or hypothesis language to the participant.",
    "",
    `Study title: ${input.study.title}`,
    `Study objective: ${input.study.objective}`,
    `Audience: ${input.study.audience}`,
    `Context: ${input.study.context}`,
    "",
    `Approved opening question: ${input.plan.openingQuestion}`,
    "Hypotheses to test:",
    formatOrderedList(input.plan.hypotheses),
    "",
    "Ordered topics to cover:",
    formatOrderedList(input.plan.topics),
    "",
    `Interviewer tone: ${input.plan.selectedTone}`,
    `Interviewer behavior mode: ${input.plan.selectedBehaviorId}`,
    `Behavior guidance: ${behaviorGuidance[input.plan.selectedBehaviorId]}`,
    `Must-cover areas: ${input.plan.mustCoverAreas.join(", ") || "None"}`,
    `Things to avoid: ${input.plan.thingsToAvoid.join(", ") || "None"}`,
    `Probing strategy: ${input.plan.probingStrategy.join(", ") || "None"}`,
    `Example probes: ${input.plan.exampleProbes.join(", ") || "None"}`,
    "",
    "Participant profile:",
    participantProfile,
    "",
    "Current progress state:",
    formatProgressState(input.progressState),
    `Current active topic focus: ${activeTopic}`,
    `Next remaining topics: ${remainingTopics}`,
    "",
    skipInstruction,
    "",
    "Recent transcript:",
    transcriptTail || "No prior turns.",
  ].join("\n");
}

export function buildTurnAnnotationPrompt(input: {
  assistantText: string;
  event?: PublicInterviewChatEvent;
  participantResponses: ParticipantResponses;
  plan: StudyPlan;
  progressState: InterviewProgressState;
  study: StudyRow;
  transcript: TranscriptTurnRow[];
  userText: string;
}) {
  return [
    "Analyze the latest interview exchange and update interview progress.",
    "Return only structured data that matches the schema.",
    "Use only the approved plan topics when deciding coverage.",
    "Treat the plan topics as an ordered agenda.",
    "Mark a topic as covered only when the participant has provided meaningful evidence on it.",
    "Meaningful evidence usually means a concrete reason, example, behavior, feeling with context, or outcome related to the topic.",
    input.event === "skip-question"
      ? "The latest participant event was a skip, not an answer. Do not treat the skip text as evidence, do not create contradictions from it, and do not mark any topic as covered because of it."
      : "The latest participant event was an answer. Base coverage only on what the participant actually said.",
    "If the latest participant turn provides meaningful evidence for the current active topic, mark that topic covered and advance the active topic to the next uncovered topic.",
    "If the latest participant turn is still vague or incomplete for the current active topic, keep that topic active.",
    "If all topics are covered, set activeTopicLabel to null, remainingTopicLabels to an empty array, and completionRatio to 1.",
    "If the latest interviewer turn is a closing message because coverage is complete, the progress state should usually reflect a completed interview.",
    "Keep evidence quotes short and verbatim. Return at most 3.",
    "Return contradictions only when the participant said something that conflicts with a previous claim.",
    "",
    `Study title: ${input.study.title}`,
    `Study objective: ${input.study.objective}`,
    "Hypotheses to test:",
    formatOrderedList(input.plan.hypotheses),
    `Plan topics: ${input.plan.topics.join(", ")}`,
    `Must-cover areas: ${input.plan.mustCoverAreas.join(", ") || "None"}`,
    "",
    "Participant profile:",
    formatParticipantResponses(input.participantResponses),
    "",
    "Previous progress state:",
    formatProgressState(input.progressState),
    "",
    "Recent transcript:",
    formatTranscript(input.transcript) || "No prior turns.",
    "",
    `Latest participant turn: ${input.userText}`,
    `Latest interviewer turn: ${input.assistantText}`,
  ].join("\n");
}

export function buildProgressPredictionPrompt(input: {
  event?: PublicInterviewChatEvent;
  participantResponses: ParticipantResponses;
  plan: StudyPlan;
  progressState: InterviewProgressState;
  study: StudyRow;
  transcript: TranscriptTurnRow[];
  userText: string;
}) {
  return [
    "Predict the canonical interview progress state immediately after the participant's latest answer and before the interviewer responds.",
    "Return only structured data that matches the schema.",
    "Use only the approved plan topics when deciding coverage.",
    "Treat the plan topics as an ordered agenda.",
    "Mark a topic as covered only when the participant has provided meaningful evidence on it.",
    "Meaningful evidence usually means a concrete reason, example, behavior, feeling with context, or outcome related to the topic.",
    input.event === "skip-question"
      ? "The latest participant event was a skip, not an answer. Do not treat the skip text as evidence and do not mark any topic as covered because of it."
      : "The latest participant event was an answer. Base coverage only on what the participant actually said.",
    "If the latest participant turn provides meaningful evidence for the current active topic, mark that topic covered and advance the active topic to the next uncovered topic.",
    "If the latest participant turn is still vague or incomplete for the current active topic, keep that topic active.",
    "If all topics are covered, set activeTopicLabel to null, remainingTopicLabels to an empty array, and completionRatio to 1.",
    "",
    `Study title: ${input.study.title}`,
    `Study objective: ${input.study.objective}`,
    "Hypotheses to test:",
    formatOrderedList(input.plan.hypotheses),
    `Plan topics: ${input.plan.topics.join(", ")}`,
    `Must-cover areas: ${input.plan.mustCoverAreas.join(", ") || "None"}`,
    "",
    "Participant profile:",
    formatParticipantResponses(input.participantResponses),
    "",
    "Previous progress state:",
    formatProgressState(input.progressState),
    "",
    "Recent transcript:",
    formatTranscript(input.transcript) || "No prior turns.",
    "",
    `Latest participant turn: ${input.userText}`,
  ].join("\n");
}
