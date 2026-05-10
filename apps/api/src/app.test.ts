import assert from "node:assert/strict";
import { before, beforeEach, test } from "node:test";

import { migrateDatabase, truncateAllTables } from "./db/migrations.js";
import { buildApp } from "./app.js";

const testDatabaseUrl =
  process.env.DATABASE_URL_TEST ??
  "postgres://postgres:postgres@localhost:5432/motives_test";

function parseJson<T>(body: string) {
  return JSON.parse(body) as T;
}

async function createTestApp() {
  const app = buildApp({
    appBaseUrl: "http://localhost:3000",
    databaseUrl: testDatabaseUrl,
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

    const readyRouteResponse = await app.inject({
      method: "GET",
      url: `/v1/public/interviews/${invite.inviteCode}`,
    });

    assert.equal(readyRouteResponse.statusCode, 200);
    const readyRoute = parseJson<{
      kind: string;
      session: { sessionStatus: string };
    }>(readyRouteResponse.body);
    assert.equal(readyRoute.kind, "ready");
    assert.equal(readyRoute.session.sessionStatus, "welcome");

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
          usedBudgetingAppRecently: "yes",
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
