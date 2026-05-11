import envSchema from "env-schema";
import { Type, type Static } from "@sinclair/typebox";

import { loadApiEnv } from "./env.js";

export const ApiConfigSchema = Type.Object({
  ANALYSIS_WORKER_POLL_MS: Type.Integer({ default: 5000, minimum: 100 }),
  APP_BASE_URL: Type.String({ default: "http://localhost:3000", minLength: 1 }),
  DATABASE_URL: Type.String({ minLength: 1 }),
  HOST: Type.String({ default: "0.0.0.0", minLength: 1 }),
  LOG_LEVEL: Type.Union([
    Type.Literal("trace"),
    Type.Literal("debug"),
    Type.Literal("info"),
    Type.Literal("warn"),
    Type.Literal("error"),
    Type.Literal("fatal"),
  ], { default: "info" }),
  OPENAI_API_KEY: Type.Optional(Type.String({ minLength: 1 })),
  OPENAI_MODEL_AGGREGATE: Type.String({ default: "gpt-5.4", minLength: 1 }),
  OPENAI_MODEL_ANNOTATOR: Type.String({ default: "gpt-5.4-mini", minLength: 1 }),
  OPENAI_MODEL_DEBRIEF: Type.String({ default: "gpt-5.4", minLength: 1 }),
  OPENAI_MODEL_INTERVIEWER: Type.String({ default: "gpt-5.4-mini", minLength: 1 }),
  OPENAI_MODEL_PLAN_GENERATOR: Type.String({ default: "gpt-5.4", minLength: 1 }),
  OPENAI_REASONING_EFFORT: Type.String({ default: "low", minLength: 1 }),
  PORT: Type.Integer({ default: 3001, minimum: 1, maximum: 65535 }),
  RUN_ANALYSIS_WORKER: Type.Boolean({ default: true }),
});

export type ApiConfig = Static<typeof ApiConfigSchema>;
export type ApiConfigOverrides = Partial<ApiConfig>;

function toConfigData(overrides: ApiConfigOverrides) {
  return Object.fromEntries(
    Object.entries(overrides).filter(([, value]) => value !== undefined),
  );
}

export function loadApiConfig(overrides: ApiConfigOverrides = {}): ApiConfig {
  loadApiEnv();

  return envSchema<ApiConfig>({
    data: {
      ...process.env,
      ...toConfigData(overrides),
    },
    schema: ApiConfigSchema,
  });
}
