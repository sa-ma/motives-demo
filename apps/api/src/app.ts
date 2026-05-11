import Fastify from "fastify";
import cors from "@fastify/cors";
import sensible from "@fastify/sensible";

import { ApiError } from "./lib/errors.js";
import { loadApiEnv } from "./lib/env.js";
import type { InterviewAiService } from "./ai/service.js";
import type { ResearchAiService } from "./ai/research-service.js";
import { aiPlugin } from "./plugins/ai.js";
import { databasePlugin } from "./plugins/database.js";
import { healthRoutes } from "./routes/health.js";
import { publicInterviewsRoutes } from "./routes/public-interviews.js";
import { studiesRoutes } from "./routes/studies.js";

loadApiEnv();

type BuildAppOptions = {
  appBaseUrl?: string;
  databaseUrl?: string;
  interviewAiService?: InterviewAiService;
  researchAiService?: ResearchAiService;
};

function isHttpError(
  error: unknown,
): error is {
  statusCode: number;
  message: string;
} {
  return (
    typeof error === "object" &&
    error !== null &&
    "statusCode" in error &&
    typeof error.statusCode === "number" &&
    "message" in error &&
    typeof error.message === "string"
  );
}

export function buildApp(options: BuildAppOptions = {}) {
  const databaseUrl = options.databaseUrl ?? process.env.DATABASE_URL;

  if (!databaseUrl) {
    throw new Error("DATABASE_URL is required to start the API.");
  }

  const app = Fastify({
    logger: true,
  });

  app.register(sensible);
  app.register(cors, {
    allowedHeaders: ["Content-Type"],
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    origin: true,
  });

  app.setErrorHandler((error, _request, reply) => {
    if (error instanceof ApiError) {
      reply.status(error.statusCode).send({
        error: error.message,
      });
      return;
    }

    if (isHttpError(error) && error.statusCode >= 400) {
      reply.status(error.statusCode).send({
        error: error.message,
      });
      return;
    }

    reply.status(500).send({
      error: "Internal server error.",
    });
  });

  app.register(databasePlugin, {
    appBaseUrl: options.appBaseUrl ?? process.env.APP_BASE_URL ?? "http://localhost:3000",
    databaseUrl,
  });
  app.register(aiPlugin, {
    interviewAiService: options.interviewAiService,
    researchAiService: options.researchAiService,
  });
  app.register(healthRoutes, { prefix: "/health" });
  app.register(studiesRoutes, { prefix: "/v1/studies" });
  app.register(publicInterviewsRoutes, { prefix: "/v1/public/interviews" });

  return app;
}
