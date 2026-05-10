"use client";

import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import {
  ArrowRight,
  CircleAlert,
  LoaderCircle,
  SkipForward,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";

import { Conversation, ConversationContent } from "@/components/ai-elements/conversation";
import { Message, MessageContent, MessageResponse } from "@/components/ai-elements/message";
import {
  PromptInput,
  PromptInputSubmit,
  PromptInputTextarea,
} from "@/components/ai-elements/prompt-input";
import { InterviewPublicShell } from "@/components/interviews/participant-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { browserApiClient } from "@/lib/api/client";
import type {
  InterviewInvitePayload,
  InterviewProgressState,
  InterviewUIMessage,
} from "@/lib/interviews/types";
import { SKIP_QUESTION_MESSAGE } from "@motives-ai/contracts";
import { cn } from "@/lib/utils";

function getMessageText(message: InterviewUIMessage) {
  return message.parts
    .filter((part) => part.type === "text")
    .map((part) => part.text)
    .join("");
}

export function InterviewRoom({
  invite,
  initialProgressState,
  initialMessages,
}: {
  initialMessages: InterviewUIMessage[];
  initialProgressState: InterviewProgressState;
  invite: InterviewInvitePayload;
}) {
  const router = useRouter();
  const scrollAnchorRef = useRef<HTMLDivElement | null>(null);
  const [input, setInput] = useState("");
  const [isEndingInterview, startEndingInterview] = useTransition();
  const {
    clearError,
    error,
    messages,
    sendMessage,
    setMessages,
    status,
  } = useChat<InterviewUIMessage>({
    id: invite.inviteCode,
    messages: initialMessages,
    transport: new DefaultChatTransport({
      api: `/api/interviews/${invite.inviteCode}/chat`,
      prepareSendMessagesRequest({ body, id, messages }) {
        const message = messages[messages.length - 1];

        return {
          body: {
            event:
              typeof body === "object" && body !== null && "event" in body
                ? body.event
                : undefined,
            id,
            message,
          },
        };
      },
    }),
  });

  useEffect(() => {
    scrollAnchorRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages]);

  useEffect(() => {
    setMessages(initialMessages);
  }, [initialMessages, setMessages]);

  const progressState =
    [...messages]
      .reverse()
      .find((message) => message.metadata?.progressState)?.metadata?.progressState ??
    initialProgressState;
  const isInterviewCovered =
    progressState.activeTopicLabel === null &&
    progressState.coveredTopicLabels.length >= invite.topicLabels.length;

  const submitMessage = async (event: "answer" | "skip-question") => {
    const text =
      event === "skip-question"
        ? SKIP_QUESTION_MESSAGE
        : input.trim();

    if (!text) {
      return;
    }

    if (event === "answer") {
      setInput("");
    }

    await sendMessage(
      {
        text,
      },
      {
        body: {
          event,
        },
      },
    );
  };

  return (
    <InterviewPublicShell mode="room">
      <div className="grid h-full min-h-0 w-full gap-0 overflow-hidden lg:gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
        <Card className="flex h-full min-h-0 flex-col overflow-hidden rounded-none border-0 bg-white shadow-none lg:rounded-[28px] lg:border lg:border-zinc-200/80 lg:bg-white/96 lg:shadow-[0_32px_90px_-48px_rgba(15,23,42,0.28)]">
          <CardContent className="flex min-h-0 flex-1 flex-col p-0">
            <div className="flex flex-wrap items-center justify-between gap-4 border-b border-zinc-200/80 px-5 py-4 sm:px-6">
              <div className="space-y-1">
                <p className="text-[13px] font-semibold text-primary">Research Interview</p>
                <div className="flex flex-wrap items-center gap-2">
                  <h1 className="text-[1.15rem] font-semibold tracking-tight text-zinc-950">
                    Participant Session
                  </h1>
                  <Badge className="rounded-full bg-emerald-50 px-2.5 py-0.5 text-[11px] font-medium text-emerald-700">
                    Live
                  </Badge>
                </div>
              </div>

              <div className="flex items-center gap-3">
                <div className="rounded-full border border-zinc-200/80 bg-zinc-50 px-3 py-1 text-[12px] font-medium text-zinc-500">
                  {Math.round(progressState.completionRatio * 100)}% covered
                </div>
                <Button
                  type="button"
                  variant="outline"
                  disabled={isEndingInterview}
                  onClick={() => {
                    startEndingInterview(async () => {
                      try {
                        await browserApiClient.publicInterviews.act(invite.inviteCode, {
                          action: "complete",
                        });
                      } catch {
                        return;
                      }

                      router.replace(`/interviews/${invite.inviteCode}/complete`);
                    });
                  }}
                  className="rounded-md border-rose-200 bg-white text-rose-600 shadow-none hover:bg-rose-50 hover:text-rose-700"
                >
                  {isEndingInterview
                    ? "Ending..."
                    : isInterviewCovered
                      ? "Finish interview"
                      : "End interview"}
                </Button>
              </div>
            </div>

            {error ? (
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-rose-100 bg-rose-50 px-5 py-3 text-[13px] text-rose-700 sm:px-6">
                <div className="flex items-center gap-2">
                  <CircleAlert className="size-4" />
                  <span>{error.message || "The connection dropped while streaming."}</span>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => clearError()}
                    className="rounded-lg border-rose-200 bg-white text-rose-700 hover:bg-rose-100"
                  >
                    Dismiss
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    onClick={() => {
                      clearError();
                      router.refresh();
                    }}
                    className="rounded-lg"
                  >
                    Reload room
                  </Button>
                </div>
              </div>
            ) : null}

            {isInterviewCovered ? (
              <div className="border-b border-emerald-100 bg-emerald-50 px-5 py-3 text-[13px] text-emerald-800 sm:px-6">
                We&apos;ve covered all planned topics. You can finish the interview now.
              </div>
            ) : null}

            <Conversation>
              <ConversationContent className="bg-[linear-gradient(180deg,rgba(248,250,252,0.92),rgba(255,255,255,0.98))]">
                {messages.map((message) => {
                  const text = getMessageText(message);

                  if (!text) {
                    return null;
                  }

                  return (
                    <div key={message.id} className="space-y-1">
                      <Message from={message.role === "user" ? "user" : "assistant"}>
                        <MessageContent
                          className={cn(
                            message.role === "user"
                              ? "border-primary/8 bg-primary/[0.04]"
                              : "bg-white",
                          )}
                        >
                          <MessageResponse>{text}</MessageResponse>
                        </MessageContent>
                      </Message>
                      <p
                        className={cn(
                          "px-11 text-[11px] text-zinc-400",
                          message.role === "user" ? "text-right" : "text-left",
                        )}
                      >
                        {message.metadata?.timestampLabel ?? "Now"}
                      </p>
                    </div>
                  );
                })}

                {status === "submitted" || status === "streaming" ? (
                  <Message from="assistant">
                    <MessageContent className="bg-white">
                      <div className="flex items-center gap-2 text-[13px] text-zinc-500">
                        <LoaderCircle className="size-4 animate-spin text-primary" />
                        <span>Interviewer is responding...</span>
                      </div>
                    </MessageContent>
                  </Message>
                ) : null}

                <div ref={scrollAnchorRef} />
              </ConversationContent>
            </Conversation>

            <div className="border-t border-zinc-200/80 px-4 py-4 sm:px-6">
              <div className="mb-3 flex items-center justify-between gap-3">
                <Button
                  type="button"
                  variant="link"
                  disabled={status !== "ready" || isInterviewCovered}
                  onClick={() => submitMessage("skip-question")}
                  className="h-auto px-0 text-[13px] font-semibold text-primary"
                >
                  <SkipForward className="size-4" />
                  Skip question
                </Button>
                <span className="text-[12px] text-zinc-400">
                  {isInterviewCovered
                    ? "Interview coverage complete"
                    : status === "ready"
                      ? "Press Enter to send"
                      : "Streaming response"}
                </span>
              </div>

              <PromptInput
                onSubmit={(event) => {
                  event.preventDefault();
                  void submitMessage("answer");
                }}
              >
                <PromptInputTextarea
                  value={input}
                  disabled={status !== "ready" || isInterviewCovered}
                  placeholder={
                    isInterviewCovered
                      ? "Interview coverage complete."
                      : "Type your answer..."
                  }
                  onChange={(event) => setInput(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" && !event.shiftKey) {
                      event.preventDefault();
                      void submitMessage("answer");
                    }
                  }}
                />

                <div className="flex items-center justify-between gap-3">
                  <p className="text-[12px] text-zinc-400">
                    {isInterviewCovered
                      ? "No more questions are needed from the plan."
                      : "Short or detailed answers are both fine."}
                  </p>
                  <PromptInputSubmit
                    type="submit"
                    disabled={
                      status !== "ready" || isInterviewCovered || input.trim().length === 0
                    }
                  >
                    <ArrowRight className="size-4" />
                  </PromptInputSubmit>
                </div>
              </PromptInput>
            </div>
          </CardContent>
        </Card>

        <Card className="hidden self-start overflow-hidden rounded-[18px] border-zinc-200/80 bg-white/96 shadow-[0_32px_90px_-48px_rgba(15,23,42,0.24)] lg:block">
          <CardContent className="space-y-5 p-4">
            <div className="space-y-2">
              <h2 className="text-[13px] font-semibold text-zinc-950">
                Interview Coverage
              </h2>
              <p className="text-[12px] font-semibold text-primary">
                {progressState.coveredTopicLabels.length} / {invite.topicLabels.length} topics covered
              </p>
            </div>

            <div className="h-2 overflow-hidden rounded-full bg-zinc-100">
              <div
                className="h-full rounded-full bg-[linear-gradient(90deg,#2563eb,#60a5fa)]"
                style={{ width: `${Math.max(progressState.completionRatio * 100, 8)}%` }}
              />
            </div>

            <div className="space-y-2.5">
              {invite.topicLabels.map((topic) => {
                const isCovered = progressState.coveredTopicLabels.includes(topic);
                const isActive = progressState.activeTopicLabel === topic;

                return (
                  <div
                    key={topic}
                    className="flex items-center justify-between gap-4"
                  >
                    <span className="text-[12px] font-medium text-zinc-700">
                      {topic}
                    </span>
                    <span
                      className={cn(
                        "shrink-0 text-[12px] font-medium",
                        isCovered
                          ? "text-emerald-600"
                          : isActive
                            ? "text-amber-500"
                            : "text-zinc-400",
                      )}
                    >
                      {isCovered ? "Covered" : isActive ? "In progress" : "Not started"}
                    </span>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      </div>
    </InterviewPublicShell>
  );
}
