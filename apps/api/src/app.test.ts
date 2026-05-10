import assert from "node:assert/strict";
import { before, beforeEach, test } from "node:test";

import type { InterviewAiService } from "./ai/service.js";
import { migrateDatabase, truncateAllTables } from "./db/migrations.js";
import { buildApp } from "./app.js";

const testDatabaseUrl =
  process.env.DATABASE_URL_TEST ??
  "postgres://postgres:postgres@localhost:5432/motives_test";

function parseJson<T>(body: string) {
  return JSON.parse(body) as T;
}

async function* streamTokens(text: string) {
  for (const token of text.split(/(\s+)/)) {
    if (!token) {
      continue;
    }

    yield token;
  }
}

function buildProgressState(topicLabels: string[], userTurnCount: number) {
  const coveredCount = Math.min(userTurnCount, topicLabels.length);
  const activeTopicLabel =
    coveredCount >= topicLabels.length ? null : topicLabels[coveredCount] ?? null;

  return {
    activeTopicLabel,
    completionRatio:
      topicLabels.length === 0 ? 0 : Math.min((coveredCount + 0.25) / topicLabels.length, 1),
    coveredTopicLabels: topicLabels.slice(0, coveredCount),
    remainingTopicLabels:
      activeTopicLabel === null ? [] : topicLabels.slice(coveredCount + 1),
  };
}

function createFakeInterviewAiService(): InterviewAiService {
  return {
    async annotateAssistantTurn(input) {
      const userTurnCount = input.transcript.filter((turn) => turn.role === "user").length;

      return {
        contradictions: [],
        emotionSignal: "medium",
        evidenceQuotes: [input.userText.slice(0, 120)].filter(Boolean),
        progressState: buildProgressState(input.plan.topics, userTurnCount),
      };
    },

    async predictProgressAfterParticipantTurn(input) {
      const userTurnCount = input.transcript.filter((turn) => turn.role === "user").length;

      return buildProgressState(input.plan.topics, userTurnCount);
    },

    async startAssistantTurn(input) {
      const lastUserTurn = [...input.transcript]
        .reverse()
        .find((turn) => turn.role === "user");
      const responseText = `Thanks for sharing that. What happened next after ${lastUserTurn?.text ?? "that"}?`;

      return {
        async finish() {
          return {
            finishReason: "stop",
            model: "test-interviewer",
            providerResponseId: "response_test",
            text: responseText,
          };
        },
        model: "test-interviewer",
        textStream: streamTokens(responseText),
      };
    },
  };
}

async function createReadyInterview(app: Awaited<ReturnType<typeof createTestApp>>) {
  const createStudyResponse = await app.inject({
    method: "POST",
    payload: {
      audience: "Budgeting app users",
      context: "Mobile budgeting apps",
      durationMinutes: 10,
      objective: "Understand onboarding retention.",
      title: "AI interview study",
      topics: ["Onboarding", "Trust", "Retention"],
    },
    url: "/v1/studies",
  });
  const createdStudy = parseJson<{ studyId: string }>(createStudyResponse.body);

  await app.inject({
    method: "POST",
    payload: {},
    url: `/v1/studies/${createdStudy.studyId}/plan/generate`,
  });
  await app.inject({
    method: "POST",
    payload: {},
    url: `/v1/studies/${createdStudy.studyId}/plan/approve`,
  });
  const createInviteResponse = await app.inject({
    method: "POST",
    payload: {},
    url: `/v1/studies/${createdStudy.studyId}/invites`,
  });
  const invite = parseJson<{ inviteCode: string }>(createInviteResponse.body);

  await app.inject({
    method: "POST",
    payload: {
      action: "advance-to-details",
    },
    url: `/v1/public/interviews/${invite.inviteCode}/actions`,
  });
  await app.inject({
    method: "POST",
    payload: {
      action: "submit-details",
      consentAccepted: true,
      participantResponses: {
        preferredName: "Alex",
      },
    },
    url: `/v1/public/interviews/${invite.inviteCode}/actions`,
  });
  await app.inject({
    method: "POST",
    payload: {
      action: "start-room",
    },
    url: `/v1/public/interviews/${invite.inviteCode}/actions`,
  });

  return invite;
}

async function createTestApp(options: {
  interviewAiService?: InterviewAiService;
} = {}) {
  const app = buildApp({
    appBaseUrl: "http://localhost:3000",
    databaseUrl: testDatabaseUrl,
    interviewAiService: options.interviewAiService ?? createFakeInterviewAiService(),
  });

  await app.ready();

  return app;
}

before(async () => {
  await migrateDatabase(testDatabaseUrl);
});

beforeEach(async () => {
  await truncateAllTables(testDatabaseUrl);
});

test("POST /v1/studies validates the payload", async () => {
  const app = await createTestApp();

  try {
    const response = await app.inject({
      method: "POST",
      payload: {
        title: "",
      },
      url: "/v1/studies",
    });

    assert.equal(response.statusCode, 400);
  } finally {
    await app.close();
  }
});

test("GET /v1/studies supports status, search, and updated sorting", async () => {
  const app = await createTestApp();

  try {
    const firstStudy = parseJson<{ studyId: string }>(
      (
        await app.inject({
          method: "POST",
          payload: {
            audience: "Gen Z users",
            context: "Budgeting tools",
            durationMinutes: 15,
            objective: "Planning study objective",
            title: "Planning backlog study",
            topics: ["Onboarding"],
          },
          url: "/v1/studies",
        })
      ).body,
    );
    const secondStudy = parseJson<{ studyId: string }>(
      (
        await app.inject({
          method: "POST",
          payload: {
            audience: "Mobile users",
            context: "Budgeting tools",
            durationMinutes: 15,
            objective: "Active study objective",
            title: "Active retention study",
            topics: ["Trust"],
          },
          url: "/v1/studies",
        })
      ).body,
    );
    const thirdStudy = parseJson<{ studyId: string }>(
      (
        await app.inject({
          method: "POST",
          payload: {
            audience: "Former customers",
            context: "Budgeting tools",
            durationMinutes: 15,
            objective: "Completed study objective",
            title: "Completed debrief study",
            topics: ["Retention"],
          },
          url: "/v1/studies",
        })
      ).body,
    );

    await app.pgPool.query(
      `
        update study
        set
          status = case id
            when $1 then 'planning'
            when $2 then 'interviewing'
            when $3 then 'completed'
          end::study_status,
          updated_at = case id
            when $1 then '2026-01-01T00:00:00.000Z'::timestamptz
            when $2 then '2026-01-02T00:00:00.000Z'::timestamptz
            when $3 then '2026-01-03T00:00:00.000Z'::timestamptz
          end
        where id in ($1, $2, $3)
      `,
      [firstStudy.studyId, secondStudy.studyId, thirdStudy.studyId],
    );

    const activeStudies = parseJson<Array<{ id: string }>>(
      (
        await app.inject({
          method: "GET",
          url: "/v1/studies?status=active",
        })
      ).body,
    );
    assert.deepEqual(activeStudies.map((study) => study.id), [secondStudy.studyId]);

    const planningStudies = parseJson<Array<{ id: string }>>(
      (
        await app.inject({
          method: "GET",
          url: "/v1/studies?status=planning",
        })
      ).body,
    );
    assert.deepEqual(planningStudies.map((study) => study.id), [firstStudy.studyId]);

    const completedStudies = parseJson<Array<{ id: string }>>(
      (
        await app.inject({
          method: "GET",
          url: "/v1/studies?status=completed",
        })
      ).body,
    );
    assert.deepEqual(completedStudies.map((study) => study.id), [thirdStudy.studyId]);

    const searchedStudies = parseJson<Array<{ id: string }>>(
      (
        await app.inject({
          method: "GET",
          url: "/v1/studies?q=retention",
        })
      ).body,
    );
    assert.deepEqual(searchedStudies.map((study) => study.id), [secondStudy.studyId]);

    const ascendingStudies = parseJson<Array<{ id: string }>>(
      (
        await app.inject({
          method: "GET",
          url: "/v1/studies?sort=updated-asc",
        })
      ).body,
    );
    assert.deepEqual(ascendingStudies.map((study) => study.id), [
      firstStudy.studyId,
      secondStudy.studyId,
      thirdStudy.studyId,
    ]);

    const descendingStudies = parseJson<Array<{ id: string }>>(
      (
        await app.inject({
          method: "GET",
          url: "/v1/studies?sort=updated-desc",
        })
      ).body,
    );
    assert.deepEqual(descendingStudies.map((study) => study.id), [
      thirdStudy.studyId,
      secondStudy.studyId,
      firstStudy.studyId,
    ]);
  } finally {
    await app.close();
  }
});

test("study, plan, invite, and public session flow persists state", async () => {
  const app = await createTestApp();

  try {
    const createStudyResponse = await app.inject({
      method: "POST",
      payload: {
        audience: "Gen Z, United States",
        context: "Mobile budgeting apps",
        durationMinutes: 10,
        objective: "Understand why users abandon budgeting tools after onboarding.",
        title: "Budgeting retention study",
        topics: ["Onboarding", "Emotional friction", "Trust"],
      },
      url: "/v1/studies",
    });

    assert.equal(createStudyResponse.statusCode, 201);
    const createdStudy = parseJson<{ studyId: string }>(createStudyResponse.body);

    const createInviteWithoutApproval = await app.inject({
      method: "POST",
      payload: {},
      url: `/v1/studies/${createdStudy.studyId}/invites`,
    });

    assert.equal(createInviteWithoutApproval.statusCode, 409);

    const generatedPlanResponse = await app.inject({
      method: "POST",
      payload: {},
      url: `/v1/studies/${createdStudy.studyId}/plan/generate`,
    });

    assert.equal(generatedPlanResponse.statusCode, 200);
    const generatedPlan = parseJson<{ topics: string[] }>(generatedPlanResponse.body);
    assert.ok(generatedPlan.topics.length >= 3);

    const updatedPlanResponse = await app.inject({
      method: "PUT",
      payload: {
        mustCoverAreas: ["Trust erosion"],
        selectedBehaviorId: "ask-for-examples",
        selectedTone: "Warm and curious",
        thingsToAvoid: ["Leading questions"],
        topics: ["Onboarding", "Trust erosion", "Retention triggers"],
      },
      url: `/v1/studies/${createdStudy.studyId}/plan`,
    });

    assert.equal(updatedPlanResponse.statusCode, 200);
    const updatedPlan = parseJson<{ mustCoverAreas: string[]; selectedTone: string }>(
      updatedPlanResponse.body,
    );
    assert.deepEqual(updatedPlan.mustCoverAreas, ["Trust erosion"]);
    assert.equal(updatedPlan.selectedTone, "Warm and curious");

    const approvedPlanResponse = await app.inject({
      method: "POST",
      payload: {},
      url: `/v1/studies/${createdStudy.studyId}/plan/approve`,
    });

    assert.equal(approvedPlanResponse.statusCode, 200);

    const createInviteResponse = await app.inject({
      method: "POST",
      payload: {},
      url: `/v1/studies/${createdStudy.studyId}/invites`,
    });

    assert.equal(createInviteResponse.statusCode, 200);
    const invite = parseJson<{ inviteCode: string }>(createInviteResponse.body);

    const studiesResponse = await app.inject({
      method: "GET",
      url: "/v1/studies",
    });

    assert.equal(studiesResponse.statusCode, 200);
    const studies = parseJson<Array<{ id: string; latestInviteUrl?: string }>>(
      studiesResponse.body,
    );
    assert.equal(
      studies.find((study) => study.id === createdStudy.studyId)?.latestInviteUrl,
      `http://localhost:3000/interviews/${invite.inviteCode}`,
    );

    const readyRouteResponse = await app.inject({
      method: "GET",
      url: `/v1/public/interviews/${invite.inviteCode}`,
    });

    assert.equal(readyRouteResponse.statusCode, 200);
    const readyRoute = parseJson<{
      invite: { participantFields: Array<{ id: string; label: string }> };
      kind: string;
      session: { sessionStatus: string };
    }>(readyRouteResponse.body);
    assert.equal(readyRoute.kind, "ready");
    assert.equal(readyRoute.session.sessionStatus, "welcome");
    assert.equal(
      readyRoute.invite.participantFields.some(
        (field) =>
          field.id === "studyExperience" || field.id === "usedBudgetingAppRecently",
      ),
      false,
    );

    const invalidRouteResponse = await app.inject({
      method: "GET",
      url: "/v1/public/interviews/DOESNOTEXIST",
    });

    assert.equal(invalidRouteResponse.statusCode, 404);

    const advanceToDetailsResponse = await app.inject({
      method: "POST",
      payload: {
        action: "advance-to-details",
      },
      url: `/v1/public/interviews/${invite.inviteCode}/actions`,
    });

    assert.equal(advanceToDetailsResponse.statusCode, 200);

    const submitDetailsResponse = await app.inject({
      method: "POST",
      payload: {
        action: "submit-details",
        consentAccepted: true,
        participantResponses: {
          preferredName: "Alex",
        },
      },
      url: `/v1/public/interviews/${invite.inviteCode}/actions`,
    });

    assert.equal(submitDetailsResponse.statusCode, 200);
    const submittedDetails = parseJson<{
      participantResponses: Record<string, string | boolean>;
      sessionStatus: string;
    }>(submitDetailsResponse.body);
    assert.equal(submittedDetails.sessionStatus, "preparing");
    assert.equal(submittedDetails.participantResponses.preferredName, "Alex");

    const startRoomResponse = await app.inject({
      method: "POST",
      payload: {
        action: "start-room",
      },
      url: `/v1/public/interviews/${invite.inviteCode}/actions`,
    });

    assert.equal(startRoomResponse.statusCode, 200);

    const roomRouteResponse = await app.inject({
      method: "GET",
      url: `/v1/public/interviews/${invite.inviteCode}`,
    });

    assert.equal(roomRouteResponse.statusCode, 200);
    const roomRoute = parseJson<{
      session: {
        participantResponses: Record<string, string | boolean>;
        sessionStatus: string;
        transcript: Array<{ role: string; text: string }>;
      };
    }>(roomRouteResponse.body);
    assert.equal(roomRoute.session.sessionStatus, "room");
    assert.equal(roomRoute.session.participantResponses.preferredName, "Alex");
    assert.equal(roomRoute.session.transcript.length, 1);
    assert.equal(roomRoute.session.transcript[0]?.role, "assistant");
    assert.ok(roomRoute.session.transcript[0]?.text.length > 0);

    const chatResponse = await app.inject({
      method: "POST",
      payload: {
        event: "answer",
        id: invite.inviteCode,
        message: {
          id: "msg_1",
          parts: [
            {
              text: "I dropped off because onboarding asked for too much data.",
              type: "text",
            },
          ],
          role: "user",
        },
      },
      url: `/v1/public/interviews/${invite.inviteCode}/chat`,
    });

    assert.equal(chatResponse.statusCode, 200);

    const refreshedRoomRouteResponse = await app.inject({
      method: "GET",
      url: `/v1/public/interviews/${invite.inviteCode}`,
    });

    assert.equal(refreshedRoomRouteResponse.statusCode, 200);
    const refreshedRoomRoute = parseJson<{
      session: {
        progressState: {
          activeTopicLabel: string | null;
          coveredTopicLabels: string[];
        };
        transcript: Array<{ role: string; text: string }>;
      };
    }>(refreshedRoomRouteResponse.body);
    assert.equal(refreshedRoomRoute.session.transcript.length, 3);
    assert.equal(refreshedRoomRoute.session.transcript[1]?.role, "user");
    assert.equal(refreshedRoomRoute.session.transcript[2]?.role, "assistant");
    assert.deepEqual(refreshedRoomRoute.session.progressState.coveredTopicLabels, [
      "Onboarding",
    ]);
    assert.equal(refreshedRoomRoute.session.progressState.activeTopicLabel, "Trust erosion");

    const completeResponse = await app.inject({
      method: "POST",
      payload: {
        action: "complete",
      },
      url: `/v1/public/interviews/${invite.inviteCode}/actions`,
    });

    assert.equal(completeResponse.statusCode, 200);

    const completeRouteResponse = await app.inject({
      method: "GET",
      url: `/v1/public/interviews/${invite.inviteCode}`,
    });

    assert.equal(completeRouteResponse.statusCode, 200);
    const completeRoute = parseJson<{ session: { sessionStatus: string } }>(
      completeRouteResponse.body,
    );
    assert.equal(completeRoute.session.sessionStatus, "complete");

    await app.pgPool.query("UPDATE interview_invite SET expires_at = $1 WHERE invite_code = $2", [
      new Date(Date.now() - 60_000).toISOString(),
      invite.inviteCode,
    ]);

    const expiredRouteResponse = await app.inject({
      method: "GET",
      url: `/v1/public/interviews/${invite.inviteCode}`,
    });

    assert.equal(expiredRouteResponse.statusCode, 410);
  } finally {
    await app.close();
  }
});

test("concurrent room starts stay idempotent", async () => {
  const app = await createTestApp();

  try {
    const createStudyResponse = await app.inject({
      method: "POST",
      payload: {
        audience: "Budgeting app users",
        context: "Mobile budgeting apps",
        durationMinutes: 10,
        objective: "Understand onboarding retention.",
        title: "Concurrent invite study",
        topics: ["Onboarding", "Trust", "Retention"],
      },
      url: "/v1/studies",
    });
    const createdStudy = parseJson<{ studyId: string }>(createStudyResponse.body);

    await app.inject({
      method: "POST",
      payload: {},
      url: `/v1/studies/${createdStudy.studyId}/plan/generate`,
    });
    await app.inject({
      method: "POST",
      payload: {},
      url: `/v1/studies/${createdStudy.studyId}/plan/approve`,
    });
    const createInviteResponse = await app.inject({
      method: "POST",
      payload: {},
      url: `/v1/studies/${createdStudy.studyId}/invites`,
    });
    const invite = parseJson<{ inviteCode: string }>(createInviteResponse.body);

    await app.inject({
      method: "POST",
      payload: {
        action: "advance-to-details",
      },
      url: `/v1/public/interviews/${invite.inviteCode}/actions`,
    });
    await app.inject({
      method: "POST",
      payload: {
        action: "submit-details",
        consentAccepted: true,
        participantResponses: {
          preferredName: "Alex",
        },
      },
      url: `/v1/public/interviews/${invite.inviteCode}/actions`,
    });

    const [firstStart, secondStart] = await Promise.all([
      app.inject({
        method: "POST",
        payload: {
          action: "start-room",
        },
        url: `/v1/public/interviews/${invite.inviteCode}/actions`,
      }),
      app.inject({
        method: "POST",
        payload: {
          action: "start-room",
        },
        url: `/v1/public/interviews/${invite.inviteCode}/actions`,
      }),
    ]);

    assert.equal(firstStart.statusCode, 200);
    assert.equal(secondStart.statusCode, 200);

    const roomRouteResponse = await app.inject({
      method: "GET",
      url: `/v1/public/interviews/${invite.inviteCode}`,
    });
    const roomRoute = parseJson<{
      session: {
        transcript: Array<{ role: string; text: string }>;
      };
    }>(roomRouteResponse.body);

    assert.equal(roomRoute.session.transcript.length, 1);
    assert.equal(roomRoute.session.transcript[0]?.role, "assistant");
  } finally {
    await app.close();
  }
});

test("chat validates invite state before streaming", async () => {
  const app = await createTestApp();

  try {
    const invalidChatResponse = await app.inject({
      method: "POST",
      payload: {
        event: "answer",
        id: "DOESNOTEXIST",
        message: {
          id: "msg_invalid",
          parts: [{ text: "Hello", type: "text" }],
          role: "user",
        },
      },
      url: "/v1/public/interviews/DOESNOTEXIST/chat",
    });

    assert.equal(invalidChatResponse.statusCode, 404);

    const createStudyResponse = await app.inject({
      method: "POST",
      payload: {
        audience: "Budgeting app users",
        context: "Mobile budgeting apps",
        durationMinutes: 10,
        objective: "Understand onboarding retention.",
        title: "Pre-room chat study",
        topics: ["Onboarding", "Trust", "Retention"],
      },
      url: "/v1/studies",
    });
    const createdStudy = parseJson<{ studyId: string }>(createStudyResponse.body);

    await app.inject({
      method: "POST",
      payload: {},
      url: `/v1/studies/${createdStudy.studyId}/plan/generate`,
    });
    await app.inject({
      method: "POST",
      payload: {},
      url: `/v1/studies/${createdStudy.studyId}/plan/approve`,
    });
    const createInviteResponse = await app.inject({
      method: "POST",
      payload: {},
      url: `/v1/studies/${createdStudy.studyId}/invites`,
    });
    const invite = parseJson<{ inviteCode: string }>(createInviteResponse.body);

    const notRoomChatResponse = await app.inject({
      method: "POST",
      payload: {
        event: "answer",
        id: invite.inviteCode,
        message: {
          id: "msg_not_room",
          parts: [{ text: "Hello", type: "text" }],
          role: "user",
        },
      },
      url: `/v1/public/interviews/${invite.inviteCode}/chat`,
    });

    assert.equal(notRoomChatResponse.statusCode, 409);

    await app.pgPool.query("UPDATE interview_invite SET expires_at = $1 WHERE invite_code = $2", [
      new Date(Date.now() - 60_000).toISOString(),
      invite.inviteCode,
    ]);

    const expiredChatResponse = await app.inject({
      method: "POST",
      payload: {
        event: "answer",
        id: invite.inviteCode,
        message: {
          id: "msg_expired",
          parts: [{ text: "Hello", type: "text" }],
          role: "user",
        },
      },
      url: `/v1/public/interviews/${invite.inviteCode}/chat`,
    });

    assert.equal(expiredChatResponse.statusCode, 410);
  } finally {
    await app.close();
  }
});

test("chat replays persisted assistant turns for duplicate client message ids", async () => {
  const app = await createTestApp();

  try {
    const invite = await createReadyInterview(app);
    const payload = {
      event: "answer",
      id: invite.inviteCode,
      message: {
        id: "msg_duplicate",
        parts: [{ text: "Onboarding felt too demanding.", type: "text" }],
        role: "user",
      },
    };

    const firstChatResponse = await app.inject({
      method: "POST",
      payload,
      url: `/v1/public/interviews/${invite.inviteCode}/chat`,
    });
    const secondChatResponse = await app.inject({
      method: "POST",
      payload,
      url: `/v1/public/interviews/${invite.inviteCode}/chat`,
    });

    assert.equal(firstChatResponse.statusCode, 200);
    assert.equal(secondChatResponse.statusCode, 200);

    const roomRouteResponse = await app.inject({
      method: "GET",
      url: `/v1/public/interviews/${invite.inviteCode}`,
    });
    const roomRoute = parseJson<{
      session: {
        transcript: Array<{ role: string; text: string }>;
      };
    }>(roomRouteResponse.body);

    assert.equal(roomRoute.session.transcript.length, 3);
    assert.equal(roomRoute.session.transcript[1]?.role, "user");
    assert.equal(roomRoute.session.transcript[2]?.role, "assistant");

    const annotations = await app.db.query.sessionAnnotation.findMany();
    assert.equal(annotations.length, 1);
  } finally {
    await app.close();
  }
});

test("skip-question does not get analyzed like a participant answer", async () => {
  const app = await createTestApp({
    interviewAiService: {
      async annotateAssistantTurn() {
        throw new Error("skip events should not call annotation");
      },

      async predictProgressAfterParticipantTurn() {
        throw new Error("skip events should not call progress prediction");
      },

      async startAssistantTurn(input) {
        assert.equal(input.event, "skip-question");
        const responseText = "No problem. Let’s move on to trust. What made you feel confident or hesitant about using it?";

        return {
          async finish() {
            return {
              finishReason: "stop",
              model: "test-interviewer",
              providerResponseId: "response_skip",
              text: responseText,
            };
          },
          model: "test-interviewer",
          textStream: streamTokens(responseText),
        };
      },
    },
  });

  try {
    const invite = await createReadyInterview(app);

    const chatResponse = await app.inject({
      method: "POST",
      payload: {
        event: "skip-question",
        id: invite.inviteCode,
        message: {
          id: "msg_skip",
          parts: [{ text: "Let's skip this question.", type: "text" }],
          role: "user",
        },
      },
      url: `/v1/public/interviews/${invite.inviteCode}/chat`,
    });

    assert.equal(chatResponse.statusCode, 200);

    const roomRouteResponse = await app.inject({
      method: "GET",
      url: `/v1/public/interviews/${invite.inviteCode}`,
    });
    const roomRoute = parseJson<{
      session: {
        progressState: {
          activeTopicLabel: string | null;
          coveredTopicLabels: string[];
          remainingTopicLabels: string[];
        };
      };
    }>(roomRouteResponse.body);

    assert.deepEqual(roomRoute.session.progressState.coveredTopicLabels, []);
    assert.equal(roomRoute.session.progressState.activeTopicLabel, "Trust");
    assert.equal(
      roomRoute.session.progressState.remainingTopicLabels.includes("Onboarding"),
      true,
    );
    assert.equal(
      roomRoute.session.progressState.remainingTopicLabels.includes("Trust"),
      false,
    );

    const [annotation] = await app.db.query.sessionAnnotation.findMany();
    assert.deepEqual(annotation?.evidenceQuotes ?? [], []);
    assert.deepEqual(annotation?.contradictions ?? [], []);
  } finally {
    await app.close();
  }
});

test("chat retry completes without duplicating the persisted user turn", async () => {
  let shouldFail = true;
  const flakyAiService: InterviewAiService = {
    async annotateAssistantTurn(input) {
      const userTurnCount = input.transcript.filter((turn) => turn.role === "user").length;

      return {
        contradictions: [],
        emotionSignal: "medium",
        evidenceQuotes: [],
        progressState: buildProgressState(input.plan.topics, userTurnCount),
      };
    },

    async predictProgressAfterParticipantTurn(input) {
      const userTurnCount = input.transcript.filter((turn) => turn.role === "user").length;

      return buildProgressState(input.plan.topics, userTurnCount);
    },

    async startAssistantTurn(input) {
      const responseText = `Tell me more about ${input.study.title}.`;

      return {
        async finish() {
          if (shouldFail) {
            shouldFail = false;
            throw new Error("simulated assistant failure");
          }

          return {
            finishReason: "stop",
            model: "test-interviewer",
            providerResponseId: "response_retry",
            text: responseText,
          };
        },
        model: "test-interviewer",
        textStream: streamTokens(responseText),
      };
    },
  };

  const app = await createTestApp({
    interviewAiService: flakyAiService,
  });

  try {
    const invite = await createReadyInterview(app);
    const payload = {
      event: "answer",
      id: invite.inviteCode,
      message: {
        id: "msg_retry",
        parts: [{ text: "I abandoned it after the signup wall.", type: "text" }],
        role: "user",
      },
    };

    const firstChatResponse = await app.inject({
      method: "POST",
      payload,
      url: `/v1/public/interviews/${invite.inviteCode}/chat`,
    });
    assert.equal(firstChatResponse.statusCode, 200);

    const firstRoomRouteResponse = await app.inject({
      method: "GET",
      url: `/v1/public/interviews/${invite.inviteCode}`,
    });
    const firstRoomRoute = parseJson<{
      session: {
        transcript: Array<{ role: string; text: string }>;
      };
    }>(firstRoomRouteResponse.body);

    assert.equal(firstRoomRoute.session.transcript.length, 2);
    assert.equal(firstRoomRoute.session.transcript[1]?.role, "user");

    const secondChatResponse = await app.inject({
      method: "POST",
      payload,
      url: `/v1/public/interviews/${invite.inviteCode}/chat`,
    });
    assert.equal(secondChatResponse.statusCode, 200);

    const secondRoomRouteResponse = await app.inject({
      method: "GET",
      url: `/v1/public/interviews/${invite.inviteCode}`,
    });
    const secondRoomRoute = parseJson<{
      session: {
        transcript: Array<{ role: string; text: string }>;
      };
    }>(secondRoomRouteResponse.body);

    assert.equal(secondRoomRoute.session.transcript.length, 3);
    assert.equal(
      secondRoomRoute.session.transcript.filter((turn) => turn.role === "user").length,
      1,
    );
    assert.equal(
      secondRoomRoute.session.transcript.filter((turn) => turn.role === "assistant").length,
      2,
    );
  } finally {
    await app.close();
  }
});

test("chat falls back to heuristic topic progress when annotation fails", async () => {
  const app = await createTestApp({
    interviewAiService: {
      async annotateAssistantTurn() {
        throw new Error("simulated annotation failure");
      },

      async predictProgressAfterParticipantTurn(input) {
        const userTurnCount = input.transcript.filter((turn) => turn.role === "user").length;

        return buildProgressState(input.plan.topics, userTurnCount);
      },

      async startAssistantTurn() {
        const responseText = "Thanks for explaining that. What happened after onboarding?";

        return {
          async finish() {
            return {
              finishReason: "stop",
              model: "test-interviewer",
              providerResponseId: "response_annotation_fallback",
              text: responseText,
            };
          },
          model: "test-interviewer",
          textStream: streamTokens(responseText),
        };
      },
    },
  });

  try {
    const invite = await createReadyInterview(app);

    const chatResponse = await app.inject({
      method: "POST",
      payload: {
        event: "answer",
        id: invite.inviteCode,
        message: {
          id: "msg_fallback",
          parts: [
            {
              text: "The onboarding felt invasive and I nearly quit right there.",
              type: "text",
            },
          ],
          role: "user",
        },
      },
      url: `/v1/public/interviews/${invite.inviteCode}/chat`,
    });

    assert.equal(chatResponse.statusCode, 200);

    const refreshedRoomRouteResponse = await app.inject({
      method: "GET",
      url: `/v1/public/interviews/${invite.inviteCode}`,
    });

    assert.equal(refreshedRoomRouteResponse.statusCode, 200);
    const refreshedRoomRoute = parseJson<{
      session: {
        progressState: {
          activeTopicLabel: string | null;
          coveredTopicLabels: string[];
        };
      };
    }>(refreshedRoomRouteResponse.body);

    assert.deepEqual(refreshedRoomRoute.session.progressState.coveredTopicLabels, [
      "Onboarding",
    ]);
    assert.equal(refreshedRoomRoute.session.progressState.activeTopicLabel, "Trust");
  } finally {
    await app.close();
  }
});

test("chat uses the canonical fallback progress when prediction and annotation fail", async () => {
  const app = await createTestApp({
    interviewAiService: {
      async annotateAssistantTurn() {
        throw new Error("simulated annotation failure");
      },

      async predictProgressAfterParticipantTurn() {
        throw new Error("simulated prediction failure");
      },

      async startAssistantTurn() {
        const responseText = "Thanks for explaining that. Tell me more about what onboarding felt like.";

        return {
          async finish() {
            return {
              finishReason: "stop",
              model: "test-interviewer",
              providerResponseId: "response_prediction_fallback",
              text: responseText,
            };
          },
          model: "test-interviewer",
          textStream: streamTokens(responseText),
        };
      },
    },
  });

  try {
    const invite = await createReadyInterview(app);

    const chatResponse = await app.inject({
      method: "POST",
      payload: {
        event: "answer",
        id: invite.inviteCode,
        message: {
          id: "msg_prediction_fallback",
          parts: [
            {
              text: "The onboarding felt invasive and I nearly quit right there.",
              type: "text",
            },
          ],
          role: "user",
        },
      },
      url: `/v1/public/interviews/${invite.inviteCode}/chat`,
    });

    assert.equal(chatResponse.statusCode, 200);

    const refreshedRoomRouteResponse = await app.inject({
      method: "GET",
      url: `/v1/public/interviews/${invite.inviteCode}`,
    });

    assert.equal(refreshedRoomRouteResponse.statusCode, 200);
    const refreshedRoomRoute = parseJson<{
      session: {
        progressState: {
          activeTopicLabel: string | null;
          coveredTopicLabels: string[];
        };
      };
    }>(refreshedRoomRouteResponse.body);

    assert.deepEqual(refreshedRoomRoute.session.progressState.coveredTopicLabels, []);
    assert.equal(refreshedRoomRoute.session.progressState.activeTopicLabel, "Onboarding");
  } finally {
    await app.close();
  }
});

test("chat sends a closing message instead of another question when coverage completes", async () => {
  const app = await createTestApp({
    interviewAiService: {
      async annotateAssistantTurn(input) {
        const userTurnCount = input.transcript.filter((turn) => turn.role === "user").length;

        return {
          contradictions: [],
          emotionSignal: "medium",
          evidenceQuotes: [input.userText.slice(0, 120)].filter(Boolean),
          progressState: buildProgressState(input.plan.topics, userTurnCount),
        };
      },

      async predictProgressAfterParticipantTurn(input) {
        const userTurnCount = input.transcript.filter((turn) => turn.role === "user").length;

        return buildProgressState(input.plan.topics, userTurnCount);
      },

      async startAssistantTurn() {
        const responseText = "What happened next?";

        return {
          async finish() {
            return {
              finishReason: "stop",
              model: "test-interviewer",
              providerResponseId: "response_should_not_be_used",
              text: responseText,
            };
          },
          model: "test-interviewer",
          textStream: streamTokens(responseText),
        };
      },
    },
  });

  try {
    const invite = await createReadyInterview(app);
    const initialRouteResponse = await app.inject({
      method: "GET",
      url: `/v1/public/interviews/${invite.inviteCode}`,
    });
    assert.equal(initialRouteResponse.statusCode, 200);

    const initialRoute = parseJson<{
      invite: {
        topicLabels: string[];
      };
    }>(initialRouteResponse.body);
    const userMessages = initialRoute.invite.topicLabels.map(
      (topic, index) =>
        `Answer ${index + 1}: I had a concrete experience related to ${topic.toLowerCase()} that influenced whether I kept using the product.`,
    );

    for (const [index, text] of userMessages.entries()) {
      const chatResponse = await app.inject({
        method: "POST",
        payload: {
          event: "answer",
          id: invite.inviteCode,
          message: {
            id: `msg_close_${index + 1}`,
            parts: [{ text, type: "text" }],
            role: "user",
          },
        },
        url: `/v1/public/interviews/${invite.inviteCode}/chat`,
      });

      assert.equal(chatResponse.statusCode, 200);
    }

    const roomRouteResponse = await app.inject({
      method: "GET",
      url: `/v1/public/interviews/${invite.inviteCode}`,
    });
    assert.equal(roomRouteResponse.statusCode, 200);

    const roomRoute = parseJson<{
      session: {
        progressState: {
          activeTopicLabel: string | null;
          coveredTopicLabels: string[];
        };
        transcript: Array<{ role: string; text: string }>;
      };
    }>(roomRouteResponse.body);

    const finalAssistantTurn = [...roomRoute.session.transcript]
      .reverse()
      .find((turn) => turn.role === "assistant");

    assert.deepEqual(roomRoute.session.progressState.coveredTopicLabels, [
      ...initialRoute.invite.topicLabels,
    ]);
    assert.equal(roomRoute.session.progressState.activeTopicLabel, null);
    assert.match(
      finalAssistantTurn?.text ?? "",
      /Thanks, that covers everything I needed for this interview\./,
    );
    assert.doesNotMatch(finalAssistantTurn?.text ?? "", /\?$/);
  } finally {
    await app.close();
  }
});
