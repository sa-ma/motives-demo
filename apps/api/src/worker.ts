import { createOpenAiResearchAiService } from "./ai/research-service.js";
import { createDatabaseClient, createPgPool } from "./db/client.js";
import { loadApiEnv } from "./lib/env.js";
import { startAnalysisWorker } from "./lib/analysis-worker.js";

loadApiEnv();

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  throw new Error("DATABASE_URL is required to start the analysis worker.");
}

const pool = createPgPool(databaseUrl);
const db = createDatabaseClient(pool);
const researchAiService = createOpenAiResearchAiService();
const logger = console;

const worker = startAnalysisWorker({
  db,
  logger: {
    error(payload, message) {
      logger.error(message ?? "analysis worker error", payload);
    },
    info(payload, message) {
      logger.info(message ?? "analysis worker info", payload);
    },
  },
  pollIntervalMs: Number(process.env.ANALYSIS_WORKER_POLL_MS ?? 5000),
  researchAiService,
});

const shutdown = async () => {
  worker.stop();
  await pool.end();
  process.exit(0);
};

process.on("SIGINT", () => {
  void shutdown();
});

process.on("SIGTERM", () => {
  void shutdown();
});
