import fp from "fastify-plugin";
import { Type } from "@sinclair/typebox";
import type { FastifyPluginAsync } from "fastify";

const healthResponseSchema = Type.Object({
  status: Type.Literal("ok"),
});

const healthRoutesPlugin: FastifyPluginAsync = async (app) => {
  app.get(
    "/",
    {
      schema: {
        response: {
          200: healthResponseSchema,
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
  name: "health-routes",
});
