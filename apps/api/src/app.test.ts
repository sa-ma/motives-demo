import assert from "node:assert/strict";
import { before, beforeEach, test } from "node:test";

import type { InterviewAiService } from "./ai/service.js";
import type { ResearchAiService } from "./ai/research-service.js";
import { migrateDatabase, truncateAllTables } from "./db/migrations.js";
import { processNextAnalysisJob } from "./lib/store.js";
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

function createFakeResearchAiService(): ResearchAiService {
  return {
    async generateStudyPlan(input) {
      return {
        model: "test-plan-model",
        output: {
          exampleProbes: [
            "What happened right after that moment?",
            "What made that stand out to you?",
            "What would you have expected instead?",
            "What made it feel worth returning to at first?",
            "When did that start to change for you?",
          ],
          hypotheses: [
            `${input.study.title} loses momentum when the initial experience feels misaligned.`,
            "Trust and clarity become more important after the first touchpoint.",
            "Concrete friction moments are stronger retention drivers than generic sentiment.",
            "Retention depends on whether the app feels useful before upkeep starts to feel like work.",
          ],
          mustCoverAreas: [
            ...input.topics.map(
              (topic) => `Capture specific evidence related to ${topic.toLowerCase()}.`,
            ),
            "Capture the moment interest in the app started to drop.",
            "Capture the final trigger that made continued use feel not worth it.",
          ].slice(0, 5),
          objective: input.study.objective,
          openingQuestion: `What was your experience using ${input.study.context} from sign-up to the point you stopped using it?`,
          probingStrategy: [
            "Ask for concrete examples.",
            "Probe what changed over time.",
            "Stay close to the participant's language.",
            "Separate emotional reactions from practical friction.",
          ],
          selectedBehaviorId: "ask-for-examples",
          selectedTone: "calm, curious",
          thingsToAvoid: [
            "Leading questions about motivation",
            "Premature solutioning before the cause is clear",
            "Technical implementation detail that the participant cannot observe",
            "Generic budgeting advice unrelated to abandonment",
          ],
          topics: [
            ...input.topics,
            "Retention signals",
            "Perceived value",
          ].slice(0, 5),
        },
        providerResponseId: "plan_response_test",
      };
    },

    async generateSessionDebrief(input) {
      const participantTurns = input.transcript.filter((turn) => turn.role === "user");
      const firstParticipantTurn =
        participantTurns[0]?.text ?? "I started using the app because I needed more control.";
      const lastParticipantTurn =
        participantTurns.at(-1)?.text ?? firstParticipantTurn;

      return {
        model: "test-debrief-model",
        output: {
          contradictions: ["The participant said onboarding felt easy, but later described it as confusing."],
          emotionSignal: "medium",
          evidence: [
            {
              followUp: "Ask what specifically changed after the first session.",
              label: input.plan.topics[0] ?? "Onboarding",
              quote: firstParticipantTurn,
              theme: input.plan.topics[0] ?? "Onboarding",
              whyItMatters: "It captures the strongest concrete evidence from the session.",
            },
            {
              followUp: "Probe what would have increased trust earlier.",
              label: input.plan.topics[3] ?? "Retention",
              quote: lastParticipantTurn,
              theme: input.plan.topics[3] ?? "Retention",
              whyItMatters: "It highlights the emotional barrier to continued use.",
            },
          ],
          interviewQuality: {
            coverage: "8/10",
            depth: "7/10",
            participantEngagement: "Medium",
          },
          keyTakeaway: "The interview surfaced concrete friction and trust concerns that shape whether the experience feels worth continuing.",
          missedAreas: ["Explore what would have changed the participant's long-term retention."],
          recommendedFollowUp: [
            "What would have made the first experience feel more trustworthy?",
            "Which moment most influenced the decision to continue or stop?",
          ],
          reasoning: [
            {
              aiDecision: "Started broad and then narrowed into the strongest friction point.",
              researchPurpose: "Establish context before probing specific evidence.",
              status: "completed",
              timestamp: "00:00",
              trigger: "Opening question",
            },
            {
              aiDecision: "Followed up on the trust signal when it emerged.",
              researchPurpose: "Validate whether trust concerns affected retention.",
              status: "completed",
              timestamp: "04:12",
              trigger: "Trust concern surfaced",
            },
            {
              aiDecision: "Marked one retention topic for future probing.",
              researchPurpose: "Preserve a gap for the next session.",
              status: "planned",
              timestamp: "08:10",
              trigger: "Coverage gap",
            },
          ],
          topicCoverage: input.plan.topics.map((topic, index) => ({
            evidenceStrength:
              index === 0 ? "high" : index === 1 ? "medium" : index === 2 ? "low" : "none",
            score: index === 0 ? 4 : index === 1 ? 2 : index === 2 ? 1 : 0,
            status:
              index === 0
                ? "covered"
                : index === 1
                  ? "in-progress"
                  : index === 2
                    ? "weak-evidence"
                    : "not-explored",
            topic,
          })),
          topThemes: [
            {
              label: input.plan.topics[0] ?? "Onboarding",
              score: 4,
              strength: "high",
            },
            {
              label: input.plan.topics[1] ?? "Trust",
              score: 3,
              strength: "medium",
            },
          ],
          whyThisMatters: "It gives the team a clearer sense of what to validate across additional interviews.",
        },
        providerResponseId: "debrief_response_test",
      };
    },

    async synthesizeStudyAggregate(input) {
      return {
        model: "test-aggregate-model",
        output: {
          observation: `Across ${input.debriefs.length} completed interview${input.debriefs.length === 1 ? "" : "s"}, onboarding and trust remain the strongest recurring themes.`,
          themes: ["Onboarding", "Trust", "Retention"],
        },
        providerResponseId: "aggregate_response_test",
      };
    },
  };
}

async function drainAnalysisJobs(app: Awaited<ReturnType<typeof createTestApp>>) {
  for (;;) {
    const processed = await processNextAnalysisJob(app.db, createFakeResearchAiService());

    if (!processed) {
      return;
    }
  }
}

async function createReadyInterview(app: Awaited<ReturnType<typeof createTestApp>>) {
  const createStudyResponse = await app.inject({
    method: "POST",
    payload: {
      audience: "Budgeting app users",
      context: "Mobile budgeting apps",
      targetParticipants: 10,
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
  const invite = parseJson<{ inviteCode: string; sessionId: string }>(createInviteResponse.body);

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

  return {
    ...invite,
    studyId: createdStudy.studyId,
  };
}

async function createTestApp(options: {
  interviewAiService?: InterviewAiService;
  researchAiService?: ResearchAiService;
} = {}) {
  const app = buildApp({
    appBaseUrl: "http://localhost:3000",
    databaseUrl: testDatabaseUrl,
    interviewAiService: options.interviewAiService ?? createFakeInterviewAiService(),
    researchAiService: options.researchAiService ?? createFakeResearchAiService(),
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
            targetParticipants: 15,
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
            targetParticipants: 15,
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
            targetParticipants: 15,
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

    await app.pgPool.query(
      `
        insert into interview_session (
          id,
          study_id,
          session_status,
          participant_number,
          created_at,
          updated_at
        ) values (
          'session_active_retention',
          $1,
          'room'::session_status,
          1,
          '2026-01-02T00:00:00.000Z'::timestamptz,
          '2026-01-02T00:00:00.000Z'::timestamptz
        )
      `,
      [secondStudy.studyId],
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

test("archiving a study hides it from the default list and cancels queued analysis", async () => {
  const app = await createTestApp();

  try {
    const interview = await createReadyInterview(app);

    const completeResponse = await app.inject({
      method: "POST",
      payload: {
        action: "complete",
      },
      url: `/v1/public/interviews/${interview.inviteCode}/actions`,
    });

    assert.equal(completeResponse.statusCode, 200);

    const queuedJobsBeforeArchive = await app.pgPool.query<{
      kind: string;
      status: string;
    }>(
      `
        select kind, status
        from analysis_job
        where study_id = $1
        order by created_at asc
      `,
      [interview.studyId],
    );

    assert.deepEqual(queuedJobsBeforeArchive.rows, [
      {
        kind: "session-debrief",
        status: "queued",
      },
    ]);

    const archiveResponse = await app.inject({
      method: "POST",
      payload: {},
      url: `/v1/studies/${interview.studyId}/archive`,
    });

    assert.equal(archiveResponse.statusCode, 200);
    assert.deepEqual(parseJson(archiveResponse.body), {
      ok: true,
      status: "archived",
      studyId: interview.studyId,
    });

    const createInviteAfterArchive = await app.inject({
      method: "POST",
      payload: {},
      url: `/v1/studies/${interview.studyId}/invites`,
    });

    assert.equal(createInviteAfterArchive.statusCode, 409);

    const defaultStudies = parseJson<Array<{ id: string }>>(
      (
        await app.inject({
          method: "GET",
          url: "/v1/studies",
        })
      ).body,
    );
    assert.equal(
      defaultStudies.some((study) => study.id === interview.studyId),
      false,
    );

    const archivedStudies = parseJson<Array<{ id: string; canArchiveStudy: boolean }>>(
      (
        await app.inject({
          method: "GET",
          url: "/v1/studies?status=archived",
        })
      ).body,
    );
    assert.deepEqual(archivedStudies.map((study) => study.id), [interview.studyId]);
    assert.equal(archivedStudies[0]?.canArchiveStudy, false);

    const detailResponse = await app.inject({
      method: "GET",
      url: `/v1/studies/${interview.studyId}`,
    });

    assert.equal(detailResponse.statusCode, 200);
    const detail = parseJson<{
      canApprovePlan: boolean;
      canEditPlan: boolean;
      canEndStudy: boolean;
      canRegeneratePlan: boolean;
      canStartInterview: boolean;
      status: string;
      statusLabel: string;
    }>(detailResponse.body);
    assert.equal(detail.status, "archived");
    assert.equal(detail.statusLabel, "Archived");
    assert.equal(detail.canStartInterview, false);
    assert.equal(detail.canApprovePlan, false);
    assert.equal(detail.canEditPlan, false);
    assert.equal(detail.canRegeneratePlan, false);
    assert.equal(detail.canEndStudy, false);

    const queuedJobsAfterArchive = await app.pgPool.query<{
      kind: string;
      status: string;
    }>(
      `
        select kind, status
        from analysis_job
        where study_id = $1
        order by created_at asc
      `,
      [interview.studyId],
    );

    assert.deepEqual(queuedJobsAfterArchive.rows, [
      {
        kind: "session-debrief",
        status: "cancelled",
      },
    ]);
  } finally {
    await app.close();
  }
});

test("archiving a study is rejected while participant sessions are still active", async () => {
  const app = await createTestApp();

  try {
    const interview = await createReadyInterview(app);

    const archiveResponse = await app.inject({
      method: "POST",
      payload: {},
      url: `/v1/studies/${interview.studyId}/archive`,
    });

    assert.equal(archiveResponse.statusCode, 409);
    assert.deepEqual(parseJson(archiveResponse.body), {
      error: "All participant sessions must be finished before archiving the study.",
    });
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
        targetParticipants: 10,
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
        mustCoverAreas: [
          "Trust erosion after setup",
          "Retention friction in the first week",
          "The moment the app stopped feeling worth returning to",
          "The strongest emotional reaction tied to using the app",
          "What reduced confidence in the app's accuracy or advice",
        ],
        selectedBehaviorId: "ask-for-examples",
        selectedTone: "Warm and curious",
        thingsToAvoid: [
          "Leading questions about motivation",
          "Overly abstract product evaluation",
          "Bundling multiple causes into one question",
          "Feature wishlist discussion before understanding abandonment",
        ],
        topics: [
          "Onboarding",
          "Trust erosion",
          "Retention triggers",
          "Emotional response",
          "Perceived value",
        ],
      },
      url: `/v1/studies/${createdStudy.studyId}/plan`,
    });

    assert.equal(updatedPlanResponse.statusCode, 200);
    const updatedPlan = parseJson<{ mustCoverAreas: string[]; selectedTone: string }>(
      updatedPlanResponse.body,
    );
    assert.deepEqual(updatedPlan.mustCoverAreas, [
      "Trust erosion after setup",
      "Retention friction in the first week",
      "The moment the app stopped feeling worth returning to",
      "The strongest emotional reaction tied to using the app",
      "What reduced confidence in the app's accuracy or advice",
    ]);
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

    const studyDetailResponse = await app.inject({
      method: "GET",
      url: `/v1/studies/${createdStudy.studyId}`,
    });

    assert.equal(studyDetailResponse.statusCode, 200);
    const studyDetail = parseJson<{
      analysis: { pendingDebriefs: number; readyDebriefs: number; status: string };
      metrics: Array<{ value: string }>;
      sessions: Array<{ actionLabel: string; debriefStatus: string }>;
      topicCoverage: Array<{ status: string }>;
    }>(studyDetailResponse.body);
    assert.equal(studyDetail.analysis.status, "pending");
    assert.equal(studyDetail.analysis.pendingDebriefs, 1);
    assert.equal(studyDetail.analysis.readyDebriefs, 0);
    assert.equal(studyDetail.metrics[1]?.value, "N/A");
    assert.equal(studyDetail.sessions[0]?.actionLabel, "Debrief Pending");
    assert.equal(studyDetail.sessions[0]?.debriefStatus, "pending");
    assert.equal(studyDetail.topicCoverage[0]?.status, "pending-analysis");

    await drainAnalysisJobs(app);

    const analyzedStudyDetailResponse = await app.inject({
      method: "GET",
      url: `/v1/studies/${createdStudy.studyId}`,
    });
    const analyzedStudyDetail = parseJson<{
      analysis: { readyDebriefs: number; status: string };
      sessions: Array<{ actionLabel: string; debriefStatus: string }>;
    }>(analyzedStudyDetailResponse.body);
    assert.equal(analyzedStudyDetail.analysis.status, "ready");
    assert.equal(analyzedStudyDetail.analysis.readyDebriefs, 1);
    assert.equal(analyzedStudyDetail.sessions[0]?.actionLabel, "View Debrief");
    assert.equal(analyzedStudyDetail.sessions[0]?.debriefStatus, "ready");

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
        targetParticipants: 10,
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

test("completed interviews with no participant answers fail debrief analysis", async () => {
  const app = await createTestApp();

  try {
    const interview = await createReadyInterview(app);

    await app.inject({
      method: "POST",
      payload: { action: "complete" },
      url: `/v1/public/interviews/${interview.inviteCode}/actions`,
    });

    await drainAnalysisJobs(app);

    const studyDetailResponse = await app.inject({
      method: "GET",
      url: `/v1/studies/${interview.studyId}`,
    });
    const studyDetail = parseJson<{
      sessions: Array<{
        debriefError?: string;
        debriefStatus: string;
        topicsCoveredLabel: string;
      }>;
    }>(studyDetailResponse.body);

    assert.equal(studyDetail.sessions[0]?.debriefStatus, "failed");
    assert.match(studyDetail.sessions[0]?.topicsCoveredLabel ?? "", /^0 \/ \d+$/);
    assert.match(
      studyDetail.sessions[0]?.debriefError ?? "",
      /substantive responses/i,
    );
  } finally {
    await app.close();
  }
});

test("POST /v1/studies/:studyId/end rejects active sessions", async () => {
  const app = await createTestApp();

  try {
    const invite = await createReadyInterview(app);

    const response = await app.inject({
      method: "POST",
      payload: {},
      url: `/v1/studies/${invite.studyId}/end`,
    });

    assert.equal(response.statusCode, 409);
  } finally {
    await app.close();
  }
});

test("ended studies reject plan and invite mutations", async () => {
  const app = await createTestApp();

  try {
    const createStudyResponse = await app.inject({
      method: "POST",
      payload: {
        audience: "Existing customers",
        context: "Budgeting tools",
        targetParticipants: 15,
        objective: "Understand why retention drops after onboarding.",
        title: "Ended study",
        topics: ["Onboarding", "Trust"],
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

    const endResponse = await app.inject({
      method: "POST",
      payload: {},
      url: `/v1/studies/${createdStudy.studyId}/end`,
    });
    assert.equal(endResponse.statusCode, 200);

    const updatePlanResponse = await app.inject({
      method: "PUT",
      payload: {
        mustCoverAreas: ["Onboarding"],
        selectedBehaviorId: "ask-for-examples",
        selectedTone: "Calm and curious",
        thingsToAvoid: ["Leading questions"],
        topics: ["Onboarding", "Trust"],
      },
      url: `/v1/studies/${createdStudy.studyId}/plan`,
    });
    assert.equal(updatePlanResponse.statusCode, 409);

    const regeneratePlanResponse = await app.inject({
      method: "POST",
      payload: {},
      url: `/v1/studies/${createdStudy.studyId}/plan/generate`,
    });
    assert.equal(regeneratePlanResponse.statusCode, 409);

    const approvePlanResponse = await app.inject({
      method: "POST",
      payload: {},
      url: `/v1/studies/${createdStudy.studyId}/plan/approve`,
    });
    assert.equal(approvePlanResponse.statusCode, 409);

    const inviteResponse = await app.inject({
      method: "POST",
      payload: {},
      url: `/v1/studies/${createdStudy.studyId}/invites`,
    });
    assert.equal(inviteResponse.statusCode, 409);
  } finally {
    await app.close();
  }
});

test("GET /v1/studies/:studyId/interviews/:sessionId/debrief returns pending then ready", async () => {
  const app = await createTestApp();

  try {
    const invite = await createReadyInterview(app);

    await app.inject({
      method: "POST",
      payload: {
        event: "answer",
        id: invite.inviteCode,
        message: {
          id: "msg_debrief_ready",
          parts: [
            {
              text: "I started using it because I wanted better control over my spending.",
              type: "text",
            },
          ],
          role: "user",
        },
      },
      url: `/v1/public/interviews/${invite.inviteCode}/chat`,
    });

    await app.inject({
      method: "POST",
      payload: {
        action: "complete",
      },
      url: `/v1/public/interviews/${invite.inviteCode}/actions`,
    });

    const pendingResponse = await app.inject({
      method: "GET",
      url: `/v1/studies/${invite.studyId}/interviews/${invite.sessionId}/debrief`,
    });
    assert.equal(pendingResponse.statusCode, 200);
    assert.equal(parseJson<{ status: string }>(pendingResponse.body).status, "pending");

    await drainAnalysisJobs(app);

    const readyResponse = await app.inject({
      method: "GET",
      url: `/v1/studies/${invite.studyId}/interviews/${invite.sessionId}/debrief`,
    });
    assert.equal(readyResponse.statusCode, 200);
    const readyPayload = parseJson<{
      debrief?: { sessionId: string };
      status: string;
    }>(readyResponse.body);
    assert.equal(readyPayload.status, "ready");
    assert.equal(readyPayload.debrief?.sessionId, invite.sessionId);
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
        targetParticipants: 10,
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
