import { buildApp } from "./app.js";
import { loadApiConfig } from "./lib/config.js";
import { startAnalysisWorker } from "./lib/analysis-worker.js";

const config = loadApiConfig();
const app = buildApp({ config });
let worker: ReturnType<typeof startAnalysisWorker> | null = null;

app.addHook("onClose", async () => {
  worker?.stop();
});

const start = async () => {
  try {
    await app.ready();

    if (config.RUN_ANALYSIS_WORKER) {
      worker = startAnalysisWorker({
        db: app.db,
        logger: app.log,
        pollIntervalMs: config.ANALYSIS_WORKER_POLL_MS,
        researchAiService: app.researchAiService,
      });
    }

    await app.listen({ host: config.HOST, port: config.PORT });
  } catch (error) {
    app.log.error({ err: error }, "failed to start api");
    process.exit(1);
  }
};

void start();
