import { createOpenAiResearchAiService } from "./ai/research-service.js";
import { createDatabaseClient, createPgPool } from "./db/client.js";
import { loadApiConfig } from "./lib/config.js";
import { startAnalysisWorker } from "./lib/analysis-worker.js";

const config = loadApiConfig();
const pool = createPgPool(config.DATABASE_URL);
const db = createDatabaseClient(pool);
const researchAiService = createOpenAiResearchAiService(config);
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
  pollIntervalMs: config.ANALYSIS_WORKER_POLL_MS,
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
