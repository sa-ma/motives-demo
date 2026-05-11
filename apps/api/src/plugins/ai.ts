import fp from "fastify-plugin";

import {
  createOpenAiInterviewAiService,
  type InterviewAiService,
} from "../ai/service.js";
import {
  createOpenAiResearchAiService,
  type ResearchAiService,
} from "../ai/research-service.js";

declare module "fastify" {
  interface FastifyInstance {
    interviewAiService: InterviewAiService;
    researchAiService: ResearchAiService;
  }
}

type AiPluginOptions = {
  interviewAiService?: InterviewAiService;
  researchAiService?: ResearchAiService;
};

export const aiPlugin = fp<AiPluginOptions>(async (app, options) => {
  app.decorate(
    "interviewAiService",
    options.interviewAiService ?? createOpenAiInterviewAiService(app.config),
  );
  app.decorate(
    "researchAiService",
    options.researchAiService ?? createOpenAiResearchAiService(app.config),
  );
}, {
  dependencies: ["config"],
  name: "ai",
});
