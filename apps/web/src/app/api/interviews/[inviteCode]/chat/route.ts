import {
  createUIMessageStream,
  createUIMessageStreamResponse,
} from "ai";

import { buildAssistantReply } from "@/lib/interviews/mock";
import { getInterviewRouteState } from "@/lib/interviews/session";
import type { InterviewUIMessage } from "@/lib/interviews/types";

export const dynamic = "force-dynamic";

function delay(milliseconds: number) {
  return new Promise((resolve) => {
    setTimeout(resolve, milliseconds);
  });
}

function getMessageText(message: InterviewUIMessage | undefined) {
  if (!message) {
    return "";
  }

  return message.parts
    .filter((part) => part.type === "text")
    .map((part) => part.text)
    .join("");
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ inviteCode: string }> },
) {
  const { inviteCode } = await params;
  const routeState = await getInterviewRouteState(inviteCode);

  if (routeState.kind !== "ready") {
    return Response.json(
      { error: "Interview invite is not available." },
      { status: routeState.kind === "invalid" ? 404 : 410 },
    );
  }

  const payload = (await request.json()) as {
    event?: string;
    messages?: InterviewUIMessage[];
  };
  const messages = payload.messages ?? [];
  const lastUserMessage = [...messages].reverse().find(
    (message) => message.role === "user",
  );
  const preferredNameValue =
    routeState.session.participantResponses.preferredName;
  const preferredName =
    typeof preferredNameValue === "string" ? preferredNameValue : undefined;
  const answerCount = messages.filter((message) => message.role === "user").length;
  const responseText = buildAssistantReply({
    answerCount,
    event: payload.event,
    lastUserText: getMessageText(lastUserMessage),
    preferredName,
  });

  return createUIMessageStreamResponse({
    stream: createUIMessageStream({
      originalMessages: messages,
      async execute({ writer }) {
        const responseId = `assistant-${Date.now()}`;
        writer.write({
          id: responseId,
          type: "text-start",
        });

        for (const token of responseText.split(/(\s+)/)) {
          if (!token) {
            continue;
          }

          writer.write({
            delta: token,
            id: responseId,
            type: "text-delta",
          });
          await delay(18);
        }

        writer.write({
          id: responseId,
          type: "text-end",
        });
      },
    }),
  });
}
