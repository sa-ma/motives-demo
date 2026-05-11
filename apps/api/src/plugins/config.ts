import fp from "fastify-plugin";

import type { ApiConfig } from "../lib/config.js";

declare module "fastify" {
  interface FastifyInstance {
    config: ApiConfig;
  }
}

type ConfigPluginOptions = {
  config: ApiConfig;
};

export const configPlugin = fp<ConfigPluginOptions>(async (app, options) => {
  app.decorate("config", options.config);
}, {
  name: "config",
});
