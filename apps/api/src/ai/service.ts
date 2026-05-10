import { Output, generateText, streamText } from "ai";
import { openai } from "@ai-sdk/openai";

import type {
  InterviewProgressState,
  ParticipantResponses,
  PublicInterviewChatEvent,
  StudyPlan,
} from "@motives-ai/contracts";

import type { StudyRow, TranscriptTurnRow } from "../db/schema.js";
import { isSkipQuestionText } from "../lib/interview-progress.js";
import {
  interviewProgressStateJsonSchema,
  sessionAnnotationOutputJsonSchema,
  type SessionAnnotationOutput,
} from "./schemas.js";
import {
  buildProgressPredictionPrompt,
  buildInterviewerSystemPrompt,
  buildTurnAnnotationPrompt,
} from "./prompts.js";

type AssistantTurnInput = {
  event?: PublicInterviewChatEvent;
  participantResponses: ParticipantResponses;
  plan: StudyPlan;
  progressState: InterviewProgressState;
  study: StudyRow;
  transcript: TranscriptTurnRow[];
};

type AnnotationInput = {
  assistantText: string;
  event?: PublicInterviewChatEvent;
  participantResponses: ParticipantResponses;
  plan: StudyPlan;
  progressState: InterviewProgressState;
  study: StudyRow;
  transcript: TranscriptTurnRow[];
  userText: string;
};

type ProgressPredictionInput = {
  event?: PublicInterviewChatEvent;
  participantResponses: ParticipantResponses;
  plan: StudyPlan;
  progressState: InterviewProgressState;
  study: StudyRow;
  transcript: TranscriptTurnRow[];
  userText: string;
};

export type InterviewTurnAnnotation = SessionAnnotationOutput;

export type AssistantTurnResult = {
  finishReason: string;
  model: string;
  providerResponseId?: string;
  text: string;
};

export type AssistantTurnStream = {
  finish: () => Promise<AssistantTurnResult>;
  model: string;
  textStream: AsyncIterable<string>;
};

export interface InterviewAiService {
  annotateAssistantTurn(input: AnnotationInput): Promise<InterviewTurnAnnotation>;
  predictProgressAfterParticipantTurn(input: ProgressPredictionInput): Promise<InterviewProgressState>;
  startAssistantTurn(input: AssistantTurnInput): Promise<AssistantTurnStream>;
}

function toModelMessages(transcript: TranscriptTurnRow[]) {
  return transcript.map((turn) => ({
    content:
      turn.role === "user" && isSkipQuestionText(turn.text)
        ? "Participant skipped the previous question."
        : turn.text,
    role: turn.role,
  }));
}

function getOpenAiModels() {
  return {
    annotation:
      process.env.OPENAI_MODEL_ANNOTATOR ?? "gpt-5.4-mini",
    interviewer:
      process.env.OPENAI_MODEL_INTERVIEWER ?? "gpt-5.4-mini",
    reasoningEffort:
      process.env.OPENAI_REASONING_EFFORT ?? "low",
  } as const;
}

function ensureOpenAiApiKey() {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error("OPENAI_API_KEY is not configured for live interview chat.");
  }
}

export function createOpenAiInterviewAiService(): InterviewAiService {
  return {
    async predictProgressAfterParticipantTurn(input) {
      ensureOpenAiApiKey();
      const { annotation, reasoningEffort } = getOpenAiModels();
      const result = await generateText({
        model: openai(annotation),
        output: Output.object({
          schema: interviewProgressStateJsonSchema,
        }),
        prompt: buildProgressPredictionPrompt(input),
        providerOptions: {
          openai: {
            reasoningEffort,
          },
        },
      });

      return result.output;
    },

    async startAssistantTurn(input) {
      ensureOpenAiApiKey();
      const { interviewer, reasoningEffort } = getOpenAiModels();
      const result = streamText({
        messages: toModelMessages(input.transcript),
        model: openai(interviewer),
        providerOptions: {
          openai: {
            reasoningEffort,
          },
        },
        system: buildInterviewerSystemPrompt(input),
      });

      return {
        async finish() {
          const [text, finishReason, response] = await Promise.all([
            result.text,
            result.finishReason,
            result.response,
          ]);

          return {
            finishReason,
            model: interviewer,
            providerResponseId:
              typeof response.id === "string" ? response.id : undefined,
            text: text.trim(),
          };
        },
        model: interviewer,
        textStream: result.textStream,
      };
    },

    async annotateAssistantTurn(input) {
      ensureOpenAiApiKey();
      const { annotation, reasoningEffort } = getOpenAiModels();
      const result = await generateText({
        model: openai(annotation),
        output: Output.object({
          schema: sessionAnnotationOutputJsonSchema,
        }),
        prompt: buildTurnAnnotationPrompt(input),
        providerOptions: {
          openai: {
            reasoningEffort,
          },
        },
      });

      const output = result.output;

      return {
        contradictions: output.contradictions,
        emotionSignal: output.emotionSignal,
        evidenceQuotes: output.evidenceQuotes.slice(0, 3),
        progressState: output.progressState,
      };
    },
  };
}
