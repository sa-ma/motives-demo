import { Type } from "@sinclair/typebox";
import type { FastifyPluginAsync } from "fastify";

import {
  CreateInviteInputSchema,
  CreateInviteResponseSchema,
} from "@motives-ai/contracts/invites";
import {
  ApprovePlanResponseSchema,
  GeneratePlanInputSchema,
  StudyPlanSchema,
  UpdateStudyPlanInputSchema,
} from "@motives-ai/contracts/plans";
import {
  ArchiveStudyResponseSchema,
  CreateStudyInputSchema,
  CreateStudyResponseSchema,
  EndStudyResponseSchema,
  ListStudiesQuerySchema,
  SessionDebriefResponseSchema,
  StudyDetailSchema,
  StudySummarySchema,
} from "@motives-ai/contracts/studies";

import {
  approveStudyPlan,
  archiveStudy,
  createStudy,
  createStudyInvite,
  endStudy,
  generateStudyPlan,
  getStudySessionDebrief,
  getStudyDetail,
  getStudyPlan,
  listStudies,
  updateStudyPlan,
} from "../lib/store.js";

const studiesRoutesPlugin: FastifyPluginAsync = async (app) => {
  app.post(
    "/",
    {
      schema: {
        body: CreateStudyInputSchema,
        response: {
          201: CreateStudyResponseSchema,
        },
      },
    },
    async (request, reply) => {
      const study = await createStudy(
        app.db,
        app.appBaseUrl,
        request.body as import("@motives-ai/contracts").CreateStudyInput,
      );
      reply.code(201);
      return study;
    },
  );

  app.get(
    "/",
    {
      schema: {
        querystring: ListStudiesQuerySchema,
        response: {
          200: Type.Array(StudySummarySchema),
        },
      },
    },
    async (request) => {
      return await listStudies(
        app.db,
        app.appBaseUrl,
        request.query as import("@motives-ai/contracts").ListStudiesQuery,
      );
    },
  );

  app.get(
    "/:studyId",
    {
      schema: {
        params: Type.Object({
          studyId: Type.String(),
        }),
        response: {
          200: StudyDetailSchema,
        },
      },
    },
    async (request) => {
      const { studyId } = request.params as { studyId: string };
      return await getStudyDetail(app.db, studyId);
    },
  );

  app.get(
    "/:studyId/plan",
    {
      schema: {
        params: Type.Object({
          studyId: Type.String(),
        }),
        response: {
          200: StudyPlanSchema,
        },
      },
    },
    async (request) => {
      const { studyId } = request.params as { studyId: string };
      return await getStudyPlan(app.db, studyId);
    },
  );

  app.post(
    "/:studyId/plan/generate",
    {
      schema: {
        params: Type.Object({
          studyId: Type.String(),
        }),
        body: GeneratePlanInputSchema,
        response: {
          200: StudyPlanSchema,
        },
      },
    },
    async (request) => {
      const { studyId } = request.params as { studyId: string };
      return await generateStudyPlan(app.db, studyId, app.researchAiService);
    },
  );

  app.put(
    "/:studyId/plan",
    {
      schema: {
        params: Type.Object({
          studyId: Type.String(),
        }),
        body: UpdateStudyPlanInputSchema,
        response: {
          200: StudyPlanSchema,
        },
      },
    },
    async (request) => {
      const { studyId } = request.params as { studyId: string };
      return await updateStudyPlan(
        app.db,
        studyId,
        request.body as import("@motives-ai/contracts").UpdateStudyPlanInput,
      );
    },
  );

  app.post(
    "/:studyId/plan/approve",
    {
      schema: {
        params: Type.Object({
          studyId: Type.String(),
        }),
        body: Type.Object({}, { additionalProperties: false }),
        response: {
          200: ApprovePlanResponseSchema,
        },
      },
    },
    async (request) => {
      const { studyId } = request.params as { studyId: string };
      return await approveStudyPlan(app.db, studyId);
    },
  );

  app.post(
    "/:studyId/invites",
    {
      schema: {
        params: Type.Object({
          studyId: Type.String(),
        }),
        body: CreateInviteInputSchema,
        response: {
          200: CreateInviteResponseSchema,
        },
      },
    },
    async (request) => {
      const { studyId } = request.params as { studyId: string };
      return await createStudyInvite(app.db, app.appBaseUrl, studyId);
    },
  );

  app.post(
    "/:studyId/archive",
    {
      schema: {
        params: Type.Object({
          studyId: Type.String(),
        }),
        body: Type.Object({}, { additionalProperties: false }),
        response: {
          200: ArchiveStudyResponseSchema,
        },
      },
    },
    async (request) => {
      const { studyId } = request.params as { studyId: string };
      return await archiveStudy(app.db, studyId);
    },
  );

  app.post(
    "/:studyId/end",
    {
      schema: {
        params: Type.Object({
          studyId: Type.String(),
        }),
        body: Type.Object({}, { additionalProperties: false }),
        response: {
          200: EndStudyResponseSchema,
        },
      },
    },
    async (request) => {
      const { studyId } = request.params as { studyId: string };
      return await endStudy(app.db, studyId);
    },
  );

  app.get(
    "/:studyId/interviews/:sessionId/debrief",
    {
      schema: {
        params: Type.Object({
          sessionId: Type.String(),
          studyId: Type.String(),
        }),
        response: {
          200: SessionDebriefResponseSchema,
        },
      },
    },
    async (request) => {
      const { sessionId, studyId } = request.params as {
        sessionId: string;
        studyId: string;
      };
      return await getStudySessionDebrief(app.db, studyId, sessionId);
    },
  );
};

export const studiesRoutes = studiesRoutesPlugin;
