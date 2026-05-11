import { STATUS_CODES } from "node:http";

import Fastify from "fastify";
import type { FastifyError } from "fastify";
import cors from "@fastify/cors";
import sensible from "@fastify/sensible";

import { ApiError } from "./lib/errors.js";
import type { InterviewAiService } from "./ai/service.js";
import type { ResearchAiService } from "./ai/research-service.js";
import {
  loadApiConfig,
  type ApiConfig,
} from "./lib/config.js";
import { aiPlugin } from "./plugins/ai.js";
import { configPlugin } from "./plugins/config.js";
import { databasePlugin } from "./plugins/database.js";
import { healthRoutes } from "./routes/health.js";
import { publicInterviewsRoutes } from "./routes/public-interviews.js";
import { studiesRoutes } from "./routes/studies.js";
import type { HttpErrorDetail, HttpErrorResponse } from "./schemas/http.js";

type BuildAppOptions = {
  appBaseUrl?: string;
  config?: ApiConfig;
  databaseUrl?: string;
  interviewAiService?: InterviewAiService;
  logLevel?: ApiConfig["LOG_LEVEL"];
  researchAiService?: ResearchAiService;
};

function isHttpError(error: unknown): error is FastifyError {
  return (
    typeof error === "object" &&
    error !== null &&
    "statusCode" in error &&
    typeof error.statusCode === "number" &&
    "message" in error &&
    typeof error.message === "string"
  );
}

function buildValidationDetails(error: unknown): HttpErrorDetail[] | undefined {
  if (
    !isHttpError(error) ||
    !Array.isArray(error.validation) ||
    error.validation.length === 0
  ) {
    return undefined;
  }

  return error.validation.map((issue) => {
    const missingProperty =
      typeof issue.params === "object" &&
      issue.params !== null &&
      "missingProperty" in issue.params &&
      typeof issue.params.missingProperty === "string"
        ? issue.params.missingProperty
        : undefined;

    return {
      field: issue.instancePath || missingProperty || error.validationContext || "request",
      message: issue.message ?? "Invalid value.",
    };
  });
}

function defaultErrorCode(statusCode: number) {
  switch (statusCode) {
    case 400:
      return "BAD_REQUEST";
    case 401:
      return "UNAUTHORIZED";
    case 403:
      return "FORBIDDEN";
    case 404:
      return "NOT_FOUND";
    case 409:
      return "CONFLICT";
    case 410:
      return "GONE";
    case 422:
      return "UNPROCESSABLE_ENTITY";
    case 500:
      return "INTERNAL_SERVER_ERROR";
    case 502:
      return "BAD_GATEWAY";
    default:
      return `HTTP_${statusCode}`;
  }
}

function buildHttpErrorResponse(error: unknown): HttpErrorResponse {
  const details = buildValidationDetails(error);
  const statusCode =
    details !== undefined ? 400 : isHttpError(error) ? (error.statusCode ?? 500) : 500;
  const code =
    details !== undefined
      ? "VALIDATION_ERROR"
      : error instanceof ApiError && error.code
        ? error.code
        : defaultErrorCode(statusCode);

  return {
    code,
    ...(details ? { details } : {}),
    error: STATUS_CODES[statusCode] ?? "Error",
    message:
      details !== undefined
        ? "Validation failed."
        : statusCode >= 500
          ? "Internal server error."
          : isHttpError(error)
            ? error.message
            : "Unexpected error.",
    statusCode,
  };
}

export function buildApp(options: BuildAppOptions = {}) {
  const config =
    options.config ??
    loadApiConfig({
      APP_BASE_URL: options.appBaseUrl,
      DATABASE_URL: options.databaseUrl,
      LOG_LEVEL: options.logLevel,
    });

  const app = Fastify({
    logger: {
      level: config.LOG_LEVEL,
      redact: {
        censor: "[REDACTED]",
        paths: [
          "req.headers.authorization",
          "req.headers.cookie",
          "*.password",
          "*.secret",
          "*.token",
        ],
      },
    },
  });

  app.register(configPlugin, { config });
  app.register(sensible);
  app.register(cors, {
    allowedHeaders: ["Content-Type"],
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    origin: true,
  });

  app.setErrorHandler((error, request, reply) => {
    const response = buildHttpErrorResponse(error);

    if (response.statusCode >= 500) {
      request.log.error({ err: error, response }, "request failed");
    } else {
      request.log.warn({ err: error, response }, "request failed");
    }

    reply.status(response.statusCode).send(response);
  });

  app.register(databasePlugin);
  app.register(aiPlugin, {
    interviewAiService: options.interviewAiService,
    researchAiService: options.researchAiService,
  });
  app.register(healthRoutes, { prefix: "/health" });
  app.register(studiesRoutes, { prefix: "/v1/studies" });
  app.register(publicInterviewsRoutes, { prefix: "/v1/public/interviews" });

  return app;
}
