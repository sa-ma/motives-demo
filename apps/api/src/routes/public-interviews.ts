import { randomUUID } from "node:crypto";

import type { FastifyPluginAsync } from "fastify";
import { createUIMessageStream, pipeUIMessageStreamToResponse, type UIMessage } from "ai";
import { Type, type Static } from "@sinclair/typebox";

import {
  PublicInterviewActionInputSchema,
  PublicInterviewActionResponseSchema,
  PublicInterviewChatInputSchema,
  PublicInterviewRouteStateSchema,
  type InterviewMessageMetadata,
  type PublicInterviewActionInput,
  type PublicInterviewActionResponse,
  type PublicInterviewChatInput,
  type PublicInterviewRouteState,
} from "@motives-ai/contracts/public-interviews";

import {
  finalizePublicInterviewChatTurn,
  getPublicInterviewRouteState,
  performPublicInterviewAction,
  preparePublicInterviewChatTurn,
} from "../lib/public-interviews/service.js";
import { ApiError } from "../lib/errors.js";
import {
  advanceInterviewProgressStateAfterSkip,
  buildFallbackInterviewProgressState,
} from "../lib/interview-progress.js";
import { commonErrorResponses } from "../schemas/http.js";
import type { AssistantTurnResult } from "../ai/service.js";

function createTurnId() {
  return `turn_${randomUUID().replace(/-/g, "")}`;
}

function getMessageText(
  message: import("@motives-ai/contracts").PublicInterviewChatInput["message"],
) {
  return message.parts
    .map((part) => {
      if (
        typeof part === "object" &&
        part !== null &&
        "type" in part &&
        part.type === "text" &&
        "text" in part &&
        typeof part.text === "string"
      ) {
        return part.text;
      }

      return "";
    })
    .join("");
}

function isProgressComplete(
  topicLabels: string[],
  progressState: {
    activeTopicLabel: string | null;
    coveredTopicLabels: string[];
  },
) {
  return (
    progressState.activeTopicLabel === null &&
    progressState.coveredTopicLabels.length >= topicLabels.length
  );
}

function buildClosingMessage() {
  return "Thanks, that covers everything I needed for this interview. I really appreciate you walking me through your experience. You can end the session whenever you're ready.";
}

const InviteCodeParamsSchema = Type.Object({
  inviteCode: Type.String(),
});

type InviteCodeParams = Static<typeof InviteCodeParamsSchema>;

const publicInterviewsRoutesPlugin: FastifyPluginAsync = async (app) => {
  app.get<{ Params: InviteCodeParams; Reply: PublicInterviewRouteState }>(
    "/:inviteCode",
    {
      schema: {
        params: InviteCodeParamsSchema,
        response: {
          200: PublicInterviewRouteStateSchema,
          404: PublicInterviewRouteStateSchema,
          410: PublicInterviewRouteStateSchema,
        },
      },
    },
    async (request, reply) => {
      const { inviteCode } = request.params;
      const routeState = await getPublicInterviewRouteState(app.db, inviteCode);

      if (routeState.kind === "invalid") {
        reply.code(404);
      } else if (routeState.kind === "expired") {
        reply.code(410);
      }

      return routeState;
    },
  );

  app.post<{ Body: PublicInterviewChatInput; Params: InviteCodeParams }>(
    "/:inviteCode/chat",
    {
      schema: {
        body: PublicInterviewChatInputSchema,
        params: InviteCodeParamsSchema,
        response: commonErrorResponses,
      },
    },
    async (request, reply) => {
      const { inviteCode } = request.params;
      const input = request.body;
      const userText = getMessageText(input.message).trim();

      if (!userText) {
        throw new ApiError(400, "A participant message is required.", "PARTICIPANT_MESSAGE_REQUIRED");
      }

      const prepared = await preparePublicInterviewChatTurn(app.db, inviteCode, {
        clientMessageId: input.message.id,
        userText,
      });

      const stream = createUIMessageStream<UIMessage<InterviewMessageMetadata>>({
        async execute({ writer }) {
          if (prepared.kind === "replay") {
            writer.write({
              id: prepared.assistantTurn.id,
              type: "text-start",
            });
            writer.write({
              delta: prepared.assistantTurn.text,
              id: prepared.assistantTurn.id,
              type: "text-delta",
            });
            writer.write({
              id: prepared.assistantTurn.id,
              type: "text-end",
            });
            writer.write({
              messageMetadata: prepared.assistantMetadata,
              type: "message-metadata",
            });
            return;
          }

          const assistantTurnId = createTurnId();
          let predictedProgressState = prepared.progressState;

          if (input.event === "skip-question") {
            predictedProgressState = advanceInterviewProgressStateAfterSkip(
              prepared.topicLabels,
              prepared.progressState,
            );
          } else {
            try {
              predictedProgressState =
                await app.interviewAiService.predictProgressAfterParticipantTurn({
                  event: input.event,
                  participantResponses: prepared.participantResponses,
                  plan: prepared.plan,
                  progressState: prepared.progressState,
                  study: prepared.study,
                  transcript: prepared.transcript,
                  userText,
                });
            } catch (error) {
              request.log.warn(
                {
                  err: error,
                  inviteCode,
                  sessionId: prepared.sessionId,
                },
                "progress prediction failed; falling back to canonical progress state",
              );
              predictedProgressState = buildFallbackInterviewProgressState(
                prepared.topicLabels,
                prepared.transcript,
              );
            }
          }

          const shouldCloseInterview = isProgressComplete(
            prepared.topicLabels,
            predictedProgressState,
          );

          writer.write({
            id: assistantTurnId,
            type: "text-start",
          });

          let streamedText = "";
          let finished: AssistantTurnResult = {
            finishReason: "stop",
            model: "system-closing",
            providerResponseId: undefined,
            text: "",
          };

          if (shouldCloseInterview) {
            const closingMessage = buildClosingMessage();
            streamedText = closingMessage;
            writer.write({
              delta: closingMessage,
              id: assistantTurnId,
              type: "text-delta",
            });
            finished = {
              finishReason: "stop",
              model: "system-closing",
              providerResponseId: undefined,
              text: closingMessage,
            };
          } else {
            const assistantStream = await app.interviewAiService.startAssistantTurn({
              event: input.event,
              participantResponses: prepared.participantResponses,
              plan: prepared.plan,
              progressState: predictedProgressState,
              study: prepared.study,
              transcript: prepared.transcript,
            });

            for await (const delta of assistantStream.textStream) {
              streamedText += delta;
              writer.write({
                delta,
                id: assistantTurnId,
                type: "text-delta",
              });
            }

            finished = await assistantStream.finish();
          }
          let assistantText = finished.text.trim() || streamedText.trim();

          if (!assistantText) {
            assistantText = "Can you tell me a bit more about that?";
            writer.write({
              delta: assistantText,
              id: assistantTurnId,
              type: "text-delta",
            });
          }

          writer.write({
            id: assistantTurnId,
            type: "text-end",
          });

          let annotation;

          if (input.event === "skip-question") {
            annotation = {
              contradictions: [],
              emotionSignal: "low" as const,
              evidenceQuotes: [],
              progressState: predictedProgressState,
            };
          } else {
            try {
              annotation = await app.interviewAiService.annotateAssistantTurn({
                assistantText,
                event: input.event,
                participantResponses: prepared.participantResponses,
                plan: prepared.plan,
                progressState: prepared.progressState,
                study: prepared.study,
                transcript: prepared.transcript,
                userText,
              });
            } catch (error) {
              request.log.warn(
                {
                  err: error,
                  inviteCode,
                  sessionId: prepared.sessionId,
                },
                "assistant turn annotation failed; keeping predicted progress state",
              );
              annotation = {
                contradictions: [],
                emotionSignal: "low" as const,
                evidenceQuotes: [],
                progressState: predictedProgressState,
              };
            }
          }

          if (shouldCloseInterview) {
            annotation.progressState = predictedProgressState;
          }

          const finalized = await finalizePublicInterviewChatTurn(app.db, prepared, {
            annotation,
            assistantTurnId,
            finishReason: finished.finishReason,
            model: finished.model,
            providerResponseId: finished.providerResponseId,
            text: assistantText,
          });

          writer.write({
            messageMetadata: finalized.assistantMetadata,
            type: "message-metadata",
          });
        },
      });

      reply.hijack();
      pipeUIMessageStreamToResponse({
        response: reply.raw,
        stream,
      });
      return reply;
    },
  );

  app.post<{
    Body: PublicInterviewActionInput;
    Params: InviteCodeParams;
    Reply: PublicInterviewActionResponse;
  }>(
    "/:inviteCode/actions",
    {
      schema: {
        params: InviteCodeParamsSchema,
        body: PublicInterviewActionInputSchema,
        response: {
          200: PublicInterviewActionResponseSchema,
          ...commonErrorResponses,
        },
      },
    },
    async (request) => {
      const { inviteCode } = request.params;
      return await performPublicInterviewAction(app.db, inviteCode, request.body);
    },
  );
};

export const publicInterviewsRoutes = publicInterviewsRoutesPlugin;
