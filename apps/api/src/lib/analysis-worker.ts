import type { AppDatabase } from "../db/client.js";
import type { ResearchAiService } from "../ai/research-service.js";
import { processNextAnalysisJob } from "./store.js";

type LoggerLike = {
  error: (payload: unknown, message?: string) => void;
  info: (payload: unknown, message?: string) => void;
};

export function startAnalysisWorker(options: {
  db: AppDatabase;
  logger: LoggerLike;
  pollIntervalMs?: number;
  researchAiService: ResearchAiService;
}) {
  const pollIntervalMs = options.pollIntervalMs ?? 5_000;
  let active = true;
  let timer: NodeJS.Timeout | null = null;

  const runLoop = async () => {
    if (!active) {
      return;
    }

    try {
      let processed = false;

      do {
        processed = await processNextAnalysisJob(
          options.db,
          options.researchAiService,
        );
      } while (active && processed);
    } catch (error) {
      options.logger.error({ err: error }, "analysis worker loop failed");
    } finally {
      if (active) {
        timer = setTimeout(() => {
          void runLoop();
        }, pollIntervalMs);
      }
    }
  };

  options.logger.info({ pollIntervalMs }, "analysis worker started");
  void runLoop();

  return {
    stop() {
      active = false;

      if (timer) {
        clearTimeout(timer);
        timer = null;
      }
    },
  };
}
