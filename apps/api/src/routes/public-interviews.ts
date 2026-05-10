import type { FastifyPluginAsync } from "fastify";
import { Type } from "@sinclair/typebox";

import {
  PublicInterviewActionInputSchema,
  PublicInterviewActionResponseSchema,
  PublicInterviewRouteStateSchema,
} from "@motives-ai/contracts/public-interviews";

import {
  getPublicInterviewRouteState,
  performPublicInterviewAction,
} from "../lib/store.js";

const publicInterviewsRoutesPlugin: FastifyPluginAsync = async (app) => {
  app.get(
    "/:inviteCode",
    {
      schema: {
        params: Type.Object({
          inviteCode: Type.String(),
        }),
        response: {
          200: PublicInterviewRouteStateSchema,
          404: PublicInterviewRouteStateSchema,
          410: PublicInterviewRouteStateSchema,
        },
      },
    },
    async (request, reply) => {
      const { inviteCode } = request.params as { inviteCode: string };
      const routeState = await getPublicInterviewRouteState(app.db, inviteCode);

      if (routeState.kind === "invalid") {
        reply.code(404);
      } else if (routeState.kind === "expired") {
        reply.code(410);
      }

      return routeState;
    },
  );

  app.post(
    "/:inviteCode/actions",
    {
      schema: {
        params: Type.Object({
          inviteCode: Type.String(),
        }),
        body: PublicInterviewActionInputSchema,
        response: {
          200: PublicInterviewActionResponseSchema,
        },
      },
    },
    async (request) => {
      const { inviteCode } = request.params as { inviteCode: string };
      return await performPublicInterviewAction(
        app.db,
        inviteCode,
        request.body as import("@motives-ai/contracts").PublicInterviewActionInput,
      );
    },
  );
};

export const publicInterviewsRoutes = publicInterviewsRoutesPlugin;
