import { Output, generateText } from "ai";
import { openai } from "@ai-sdk/openai";

import type { SessionDebrief, StudyPlan } from "@motives-ai/contracts";

import type { SessionAnnotationRow, StudyRow, TranscriptTurnRow } from "../db/schema.js";
import type { ParticipantResponses } from "@motives-ai/contracts/public-interviews";
import {
  buildSessionDebriefPrompt,
  buildStudyAggregatePrompt,
  buildStudyPlanPrompt,
} from "./research-prompts.js";
import {
  generatedStudyPlanOutputJsonSchema,
  sessionDebriefOutputJsonSchema,
  studyAggregateOutputJsonSchema,
  type GeneratedStudyPlanOutput,
  type SessionDebriefOutput,
  type StudyAggregateOutput,
} from "./research-schemas.js";
import type { ApiConfig } from "../lib/config.js";

type ProviderResult<T> = {
  model: string;
  output: T;
  providerResponseId?: string;
};

export interface ResearchAiService {
  generateSessionDebrief(input: {
    annotations: SessionAnnotationRow[];
    participantLabel: string;
    participantResponses: ParticipantResponses;
    plan: StudyPlan;
    study: StudyRow;
    transcript: TranscriptTurnRow[];
  }): Promise<ProviderResult<SessionDebriefOutput>>;
  generateStudyPlan(input: {
    study: StudyRow;
    topics: string[];
  }): Promise<ProviderResult<GeneratedStudyPlanOutput>>;
  synthesizeStudyAggregate(input: {
    debriefs: SessionDebrief[];
    plan: StudyPlan;
    study: StudyRow;
  }): Promise<ProviderResult<StudyAggregateOutput>>;
}

type OpenAiResearchConfig = Pick<
  ApiConfig,
  | "OPENAI_API_KEY"
  | "OPENAI_MODEL_AGGREGATE"
  | "OPENAI_MODEL_DEBRIEF"
  | "OPENAI_MODEL_PLAN_GENERATOR"
  | "OPENAI_REASONING_EFFORT"
>;

function ensureOpenAiApiKey(config: OpenAiResearchConfig) {
  if (!config.OPENAI_API_KEY) {
    throw new Error("OPENAI_API_KEY is not configured for AI-backed study generation.");
  }
}

function getResearchModels(config: OpenAiResearchConfig) {
  return {
    aggregate: config.OPENAI_MODEL_AGGREGATE,
    debrief: config.OPENAI_MODEL_DEBRIEF,
    plan: config.OPENAI_MODEL_PLAN_GENERATOR,
    reasoningEffort: config.OPENAI_REASONING_EFFORT,
  } as const;
}

async function generateObject<T>(options: {
  config: OpenAiResearchConfig;
  model: string;
  prompt: string;
  schema: ReturnType<typeof Output.object>;
}): Promise<{ providerResponseId?: string; text: string; value: T }> {
  const result = await generateText({
    model: openai(options.model),
    output: options.schema,
    prompt: options.prompt,
    providerOptions: {
      openai: {
        reasoningEffort: getResearchModels(options.config).reasoningEffort,
      },
    },
  });

  return {
    providerResponseId:
      typeof result.providerMetadata?.openai === "object" &&
      result.providerMetadata?.openai !== null &&
      "responseId" in result.providerMetadata.openai &&
      typeof result.providerMetadata.openai.responseId === "string"
        ? result.providerMetadata.openai.responseId
        : undefined,
    text: result.text,
    value: result.output as T,
  };
}

export function createOpenAiResearchAiService(
  config: OpenAiResearchConfig,
): ResearchAiService {
  return {
    async generateStudyPlan(input) {
      ensureOpenAiApiKey(config);
      const { plan } = getResearchModels(config);
      const result = await generateObject<GeneratedStudyPlanOutput>({
        config,
        model: plan,
        prompt: buildStudyPlanPrompt(input),
        schema: Output.object({
          schema: generatedStudyPlanOutputJsonSchema,
        }),
      });

      return {
        model: plan,
        output: result.value,
        providerResponseId: result.providerResponseId,
      };
    },

    async generateSessionDebrief(input) {
      ensureOpenAiApiKey(config);
      const { debrief } = getResearchModels(config);
      const result = await generateObject<SessionDebriefOutput>({
        config,
        model: debrief,
        prompt: buildSessionDebriefPrompt(input),
        schema: Output.object({
          schema: sessionDebriefOutputJsonSchema,
        }),
      });

      return {
        model: debrief,
        output: result.value,
        providerResponseId: result.providerResponseId,
      };
    },

    async synthesizeStudyAggregate(input) {
      ensureOpenAiApiKey(config);
      const { aggregate } = getResearchModels(config);
      const result = await generateObject<StudyAggregateOutput>({
        config,
        model: aggregate,
        prompt: buildStudyAggregatePrompt(input),
        schema: Output.object({
          schema: studyAggregateOutputJsonSchema,
        }),
      });

      return {
        model: aggregate,
        output: result.value,
        providerResponseId: result.providerResponseId,
      };
    },
  };
}
