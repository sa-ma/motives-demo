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
  interviewCoverageEvaluationOutputJsonSchema,
  type InterviewCoverageEvaluationOutput,
} from "./schemas.js";
import {
  buildCoverageEvaluationPrompt,
  buildInterviewerSystemPrompt,
} from "./prompts.js";
import type { ApiConfig } from "../lib/config.js";
import type { InterviewCoverageState } from "../lib/interview-coverage.js";
import {
  deriveProgressStateFromCoverageState,
  normalizeCoverageState,
} from "../lib/interview-coverage.js";

type AssistantTurnInput = {
  event?: PublicInterviewChatEvent;
  participantResponses: ParticipantResponses;
  plan: StudyPlan;
  progressState: InterviewProgressState;
  study: StudyRow;
  transcript: TranscriptTurnRow[];
};

type CoverageEvaluationInput = {
  event?: PublicInterviewChatEvent;
  coverageState: InterviewCoverageState;
  participantResponses: ParticipantResponses;
  plan: StudyPlan;
  study: StudyRow;
  transcript: TranscriptTurnRow[];
  userText: string;
};

export type InterviewCoverageEvaluation = InterviewCoverageEvaluationOutput & {
  progressState: InterviewProgressState;
};

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
  evaluateParticipantTurn(
    input: CoverageEvaluationInput,
  ): Promise<InterviewCoverageEvaluation>;
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

type OpenAiInterviewConfig = Pick<
  ApiConfig,
  | "OPENAI_API_KEY"
  | "OPENAI_MODEL_ANNOTATOR"
  | "OPENAI_MODEL_INTERVIEWER"
  | "OPENAI_REASONING_EFFORT"
>;

function getOpenAiModels(config: OpenAiInterviewConfig) {
  return {
    annotation: config.OPENAI_MODEL_ANNOTATOR,
    interviewer: config.OPENAI_MODEL_INTERVIEWER,
    reasoningEffort: config.OPENAI_REASONING_EFFORT,
  } as const;
}

function ensureOpenAiApiKey(config: OpenAiInterviewConfig) {
  if (!config.OPENAI_API_KEY) {
    throw new Error("OPENAI_API_KEY is not configured for live interview chat.");
  }
}

export function createOpenAiInterviewAiService(
  config: OpenAiInterviewConfig,
): InterviewAiService {
  return {
    async evaluateParticipantTurn(input) {
      ensureOpenAiApiKey(config);
      const { annotation, reasoningEffort } = getOpenAiModels(config);
      const result = await generateText({
        model: openai(annotation),
        output: Output.object({
          schema: interviewCoverageEvaluationOutputJsonSchema,
        }),
        prompt: buildCoverageEvaluationPrompt(input),
        providerOptions: {
          openai: {
            reasoningEffort,
          },
        },
      });

      const output = result.output;
      const coverageState = normalizeCoverageState(
        input.plan.topics,
        output.coverageState,
      );

      return {
        contradictions: output.contradictions,
        coverageState,
        emotionSignal: output.emotionSignal,
        evidenceQuotes: output.evidenceQuotes.slice(0, 3),
        progressState: deriveProgressStateFromCoverageState(coverageState),
      };
    },

    async startAssistantTurn(input) {
      ensureOpenAiApiKey(config);
      const { interviewer, reasoningEffort } = getOpenAiModels(config);
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
  };
}
