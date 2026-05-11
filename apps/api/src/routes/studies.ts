import { Type } from "@sinclair/typebox";
import type { Static } from "@sinclair/typebox";
import type { FastifyPluginAsync } from "fastify";

import {
  CreateInviteInputSchema,
  CreateInviteResponseSchema,
  type CreateInviteInput,
  type CreateInviteResponse,
} from "@motives-ai/contracts/invites";
import {
  ApprovePlanResponseSchema,
  GeneratePlanInputSchema,
  StudyPlanSchema,
  UpdateStudyPlanInputSchema,
  type ApprovePlanResponse,
  type GeneratePlanInput,
  type StudyPlan,
  type UpdateStudyPlanInput,
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
  type ArchiveStudyResponse,
  type CreateStudyInput,
  type CreateStudyResponse,
  type EndStudyResponse,
  type ListStudiesQuery,
  type SessionDebriefResponse,
  type StudyDetail,
  type StudySummary,
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
import { commonErrorResponses } from "../schemas/http.js";

const StudyIdParamsSchema = Type.Object({
  studyId: Type.String(),
});

type StudyIdParams = Static<typeof StudyIdParamsSchema>;

const StudySessionParamsSchema = Type.Object({
  sessionId: Type.String(),
  studyId: Type.String(),
});

type StudySessionParams = Static<typeof StudySessionParamsSchema>;

const studiesRoutesPlugin: FastifyPluginAsync = async (app) => {
  app.post<{ Body: CreateStudyInput; Reply: CreateStudyResponse }>(
    "/",
    {
      schema: {
        body: CreateStudyInputSchema,
        response: {
          201: CreateStudyResponseSchema,
          ...commonErrorResponses,
        },
      },
    },
    async (request, reply) => {
      const study = await createStudy(app.db, app.appBaseUrl, request.body);
      reply.code(201);
      return study;
    },
  );

  app.get<{ Querystring: ListStudiesQuery; Reply: StudySummary[] }>(
    "/",
    {
      schema: {
        querystring: ListStudiesQuerySchema,
        response: {
          200: Type.Array(StudySummarySchema),
          ...commonErrorResponses,
        },
      },
    },
    async (request) => {
      return await listStudies(app.db, app.appBaseUrl, request.query);
    },
  );

  app.get<{ Params: StudyIdParams; Reply: StudyDetail }>(
    "/:studyId",
    {
      schema: {
        params: StudyIdParamsSchema,
        response: {
          200: StudyDetailSchema,
          ...commonErrorResponses,
        },
      },
    },
    async (request) => {
      const { studyId } = request.params;
      return await getStudyDetail(app.db, app.appBaseUrl, studyId);
    },
  );

  app.get<{ Params: StudyIdParams; Reply: StudyPlan }>(
    "/:studyId/plan",
    {
      schema: {
        params: StudyIdParamsSchema,
        response: {
          200: StudyPlanSchema,
          ...commonErrorResponses,
        },
      },
    },
    async (request) => {
      const { studyId } = request.params;
      return await getStudyPlan(app.db, studyId);
    },
  );

  app.post<{ Body: GeneratePlanInput; Params: StudyIdParams; Reply: StudyPlan }>(
    "/:studyId/plan/generate",
    {
      schema: {
        params: StudyIdParamsSchema,
        body: GeneratePlanInputSchema,
        response: {
          200: StudyPlanSchema,
          ...commonErrorResponses,
        },
      },
    },
    async (request) => {
      const { studyId } = request.params;
      return await generateStudyPlan(app.db, studyId, app.researchAiService);
    },
  );

  app.put<{ Body: UpdateStudyPlanInput; Params: StudyIdParams; Reply: StudyPlan }>(
    "/:studyId/plan",
    {
      schema: {
        params: StudyIdParamsSchema,
        body: UpdateStudyPlanInputSchema,
        response: {
          200: StudyPlanSchema,
          ...commonErrorResponses,
        },
      },
    },
    async (request) => {
      const { studyId } = request.params;
      return await updateStudyPlan(app.db, studyId, request.body);
    },
  );

  app.post<{ Body: Record<string, never>; Params: StudyIdParams; Reply: ApprovePlanResponse }>(
    "/:studyId/plan/approve",
    {
      schema: {
        params: StudyIdParamsSchema,
        body: Type.Object({}, { additionalProperties: false }),
        response: {
          200: ApprovePlanResponseSchema,
          ...commonErrorResponses,
        },
      },
    },
    async (request) => {
      const { studyId } = request.params;
      return await approveStudyPlan(app.db, studyId);
    },
  );

  app.post<{ Body: CreateInviteInput; Params: StudyIdParams; Reply: CreateInviteResponse }>(
    "/:studyId/invites",
    {
      schema: {
        params: StudyIdParamsSchema,
        body: CreateInviteInputSchema,
        response: {
          200: CreateInviteResponseSchema,
          ...commonErrorResponses,
        },
      },
    },
    async (request) => {
      const { studyId } = request.params;
      return await createStudyInvite(app.db, app.appBaseUrl, studyId);
    },
  );

  app.post<{ Body: Record<string, never>; Params: StudyIdParams; Reply: ArchiveStudyResponse }>(
    "/:studyId/archive",
    {
      schema: {
        params: StudyIdParamsSchema,
        body: Type.Object({}, { additionalProperties: false }),
        response: {
          200: ArchiveStudyResponseSchema,
          ...commonErrorResponses,
        },
      },
    },
    async (request) => {
      const { studyId } = request.params;
      return await archiveStudy(app.db, studyId);
    },
  );

  app.post<{ Body: Record<string, never>; Params: StudyIdParams; Reply: EndStudyResponse }>(
    "/:studyId/end",
    {
      schema: {
        params: StudyIdParamsSchema,
        body: Type.Object({}, { additionalProperties: false }),
        response: {
          200: EndStudyResponseSchema,
          ...commonErrorResponses,
        },
      },
    },
    async (request) => {
      const { studyId } = request.params;
      return await endStudy(app.db, studyId);
    },
  );

  app.get<{ Params: StudySessionParams; Reply: SessionDebriefResponse }>(
    "/:studyId/interviews/:sessionId/debrief",
    {
      schema: {
        params: StudySessionParamsSchema,
        response: {
          200: SessionDebriefResponseSchema,
          ...commonErrorResponses,
        },
      },
    },
    async (request) => {
      const { sessionId, studyId } = request.params;
      return await getStudySessionDebrief(app.db, studyId, sessionId);
    },
  );
};

export const studiesRoutes = studiesRoutesPlugin;
