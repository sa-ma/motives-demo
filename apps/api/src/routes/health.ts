import fp from "fastify-plugin";
import { Type, type Static } from "@sinclair/typebox";
import type { FastifyPluginAsync } from "fastify";

import { HttpErrorSchema } from "../schemas/http.js";

const healthResponseSchema = Type.Object({
  status: Type.Literal("ok"),
});

type HealthResponse = Static<typeof healthResponseSchema>;

const healthRoutesPlugin: FastifyPluginAsync = async (app) => {
  app.get<{ Reply: HealthResponse }>(
    "/",
    {
      schema: {
        response: {
          200: healthResponseSchema,
          "5xx": HttpErrorSchema,
        },
      },
    },
    async () => {
      await app.checkDatabaseHealth();
      return { status: "ok" };
    },
  );
};

export const healthRoutes = fp(healthRoutesPlugin, {
  dependencies: ["database"],
  name: "health-routes",
});
