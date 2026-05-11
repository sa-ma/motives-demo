import { buildApp } from "./app.js";
import { startAnalysisWorker } from "./lib/analysis-worker.js";

const host = process.env.HOST ?? "0.0.0.0";
const port = Number(process.env.PORT ?? 3001);

const app = buildApp();
let worker: ReturnType<typeof startAnalysisWorker> | null = null;

app.addHook("onClose", async () => {
  worker?.stop();
});

const start = async () => {
  try {
    await app.ready();

    if (process.env.RUN_ANALYSIS_WORKER !== "false") {
      worker = startAnalysisWorker({
        db: app.db,
        logger: app.log,
        pollIntervalMs: Number(process.env.ANALYSIS_WORKER_POLL_MS ?? 5000),
        researchAiService: app.researchAiService,
      });
    }

    await app.listen({ host, port });
  } catch (error) {
    app.log.error(error);
    process.exit(1);
  }
};

void start();
