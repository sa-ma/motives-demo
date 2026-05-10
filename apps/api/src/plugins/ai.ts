import fp from "fastify-plugin";

import {
  createOpenAiInterviewAiService,
  type InterviewAiService,
} from "../ai/service.js";

declare module "fastify" {
  interface FastifyInstance {
    interviewAiService: InterviewAiService;
  }
}

type AiPluginOptions = {
  interviewAiService?: InterviewAiService;
};

export const aiPlugin = fp<AiPluginOptions>(async (app, options) => {
  app.decorate(
    "interviewAiService",
    options.interviewAiService ?? createOpenAiInterviewAiService(),
  );
});
