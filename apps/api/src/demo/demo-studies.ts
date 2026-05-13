import type {
  ParticipantIntakeField,
  ParticipantResponses,
  StudyPlan,
  StudyStatus,
} from "@motives-ai/contracts";

import type { SessionDebriefOutput } from "../ai/research-schemas.js";
import {
  debriefReport as debriefReportTable,
  interviewSession as interviewSessionTable,
  participantField as participantFieldTable,
  participantProfile as participantProfileTable,
  sessionAnnotation as sessionAnnotationTable,
  study as studyTable,
  studyInvite as studyInviteTable,
  studyAggregate as studyAggregateTable,
  studyPlanVersion as studyPlanVersionTable,
  studyTopic as studyTopicTable,
  transcriptTurn as transcriptTurnTable,
} from "../db/schema.js";
import { validateGeneratedSessionDebriefOutput } from "../lib/session-debrief-validation.js";
import {
  buildSessionDebriefModel,
  buildStudyTopicCoverageFromDebriefs,
} from "../lib/study-analysis.js";
import { hydrateStudyPlanDerivedFields } from "../lib/study-plan-derived.js";
import {
  createInitialCoverageState,
  deriveProgressStateFromCoverageState,
  normalizeCoverageState,
} from "../lib/interview-coverage.js";

const MINUTE_MS = 60_000;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;

const DEMO_DEBRIEF_MODEL = "demo-debrief-seed-v2";
const DEMO_INTERVIEW_MODEL = "demo-interviewer-seed-v2";
const PLAN_SUBTITLE = "AI-generated plan tailored to your research objective";

type ReasoningSource = "assistant" | "participant";
type ReasoningStatus = "completed" | "in-progress" | "planned";

type TurnPair = {
  assistant: string;
  participant: string;
};

type ReasoningTemplate = {
  aiDecision: string;
  pairIndex: number;
  researchPurpose: string;
  source: ReasoningSource;
  status: ReasoningStatus;
  trigger: string;
};

type SessionOutputTemplate = Omit<SessionDebriefOutput, "reasoning" | "topicCoverage"> & {
  reasoning: ReasoningTemplate[];
  topicCoverage: Array<
    Omit<SessionDebriefOutput["topicCoverage"][number], "coverageOutcome"> & {
      coverageOutcome?: "covered" | "not-covered";
    }
  >;
};

type DemoSessionDefinition = {
  completedHoursAgo: number;
  debrief?: SessionOutputTemplate;
  id: string;
  participantNumber: number;
  participantResponses: ParticipantResponses;
  turns: TurnPair[];
};

type DemoStudyDefinition = {
  allThemes: string[];
  audience: string;
  context: string;
  createdDaysAgo: number;
  id: string;
  interviewsTarget: number;
  objective: string;
  observation: string;
  participantFields: ParticipantIntakeField[];
  persistAggregate?: boolean;
  plan: Omit<StudyPlan, "studyId" | "subtitle" | "title">;
  sessions: DemoSessionDefinition[];
  status: StudyStatus;
  title: string;
};

export type BuiltDemoSession = {
  annotationInsert: typeof sessionAnnotationTable.$inferInsert;
  debriefInsert: typeof debriefReportTable.$inferInsert | null;
  debriefOutput: SessionDebriefOutput | null;
  profileInsert: typeof participantProfileTable.$inferInsert;
  sessionInsert: typeof interviewSessionTable.$inferInsert;
  transcriptRows: Array<typeof transcriptTurnTable.$inferSelect>;
};

export type BuiltDemoStudy = {
  aggregateInsert: typeof studyAggregateTable.$inferInsert | null;
  debriefInserts: Array<typeof debriefReportTable.$inferInsert>;
  id: string;
  participantFieldInserts: Array<typeof participantFieldTable.$inferInsert>;
  planContent: StudyPlan;
  planVersionInserts: Array<typeof studyPlanVersionTable.$inferInsert>;
  profileInserts: Array<typeof participantProfileTable.$inferInsert>;
  sessionArtifacts: BuiltDemoSession[];
  sessionAnnotationInserts: Array<typeof sessionAnnotationTable.$inferInsert>;
  sessionInserts: Array<typeof interviewSessionTable.$inferInsert>;
  status: StudyStatus;
  studyInviteInsert: typeof studyInviteTable.$inferInsert | null;
  studyInsert: typeof studyTable.$inferInsert;
  title: string;
  topicInserts: Array<typeof studyTopicTable.$inferInsert>;
  transcriptInserts: Array<typeof transcriptTurnTable.$inferInsert>;
};

function buildId(...parts: string[]) {
  return parts
    .join("_")
    .toLowerCase()
    .replace(/[^a-z0-9_]+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_|_$/g, "");
}

function subtractTime(reference: Date, offsetMs: number) {
  return new Date(reference.getTime() - offsetMs);
}

function addMinutes(reference: Date, minutes: number) {
  return new Date(reference.getTime() + minutes * MINUTE_MS);
}

function formatTimestampLabel(value: Date) {
  return new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "2-digit",
  }).format(value);
}

function maxIso(values: string[]) {
  return values.reduce((latest, current) => (current > latest ? current : latest));
}

function computeAggregateCoverageValue(
  topicCoverage: NonNullable<typeof studyAggregateTable.$inferInsert.topicCoverage>,
) {
  if (topicCoverage.length === 0) {
    return 0;
  }

  const weighted = topicCoverage.reduce((sum, item) => {
    if (item.status === "covered") {
      return sum + 1;
    }

    if (item.status === "in-progress") {
      return sum + 0.5;
    }

    if (item.status === "weak-evidence") {
      return sum + 0.25;
    }

    return sum;
  }, 0);

  return Math.round((weighted / topicCoverage.length) * 100);
}

function buildTranscriptRows(options: {
  completedAt: Date;
  sessionId: string;
  studyId: string;
  turns: TurnPair[];
}) {
  const { completedAt, sessionId, studyId, turns } = options;
  const startedAt = subtractTime(
    completedAt,
    Math.max(turns.length * 4 + 2, 10) * MINUTE_MS,
  );
  const rows: Array<typeof transcriptTurnTable.$inferSelect> = [];
  let sortOrder = 0;

  turns.forEach((turn, pairIndex) => {
    const assistantCreatedAt = addMinutes(startedAt, pairIndex * 4);
    const participantCreatedAt = addMinutes(startedAt, pairIndex * 4 + 2);

    rows.push({
      clientMessageId: null,
      createdAt: assistantCreatedAt.toISOString(),
      finishReason: "stop",
      id: buildId(studyId, sessionId, "turn", String(sortOrder)),
      model: DEMO_INTERVIEW_MODEL,
      providerResponseId: buildId(studyId, sessionId, "provider", String(sortOrder)),
      role: "assistant",
      sessionId,
      sortOrder,
      text: turn.assistant,
      timestampLabel: formatTimestampLabel(assistantCreatedAt),
    });
    sortOrder += 1;

    rows.push({
      clientMessageId: buildId(studyId, sessionId, "message", String(sortOrder)),
      createdAt: participantCreatedAt.toISOString(),
      finishReason: null,
      id: buildId(studyId, sessionId, "turn", String(sortOrder)),
      model: null,
      providerResponseId: null,
      role: "user",
      sessionId,
      sortOrder,
      text: turn.participant,
      timestampLabel: formatTimestampLabel(participantCreatedAt),
    });
    sortOrder += 1;
  });

  return rows;
}

function resolveReasoningTimestamp(
  transcriptRows: Array<typeof transcriptTurnTable.$inferSelect>,
  reasoning: ReasoningTemplate,
) {
  const turnIndex = reasoning.pairIndex * 2 + (reasoning.source === "assistant" ? 0 : 1);
  return transcriptRows[turnIndex]?.timestampLabel ?? transcriptRows.at(-1)?.timestampLabel ?? "Now";
}

function buildCoverageStateForSession(options: {
  debriefOutput: SessionDebriefOutput | null;
  topics: string[];
  transcriptRows: Array<typeof transcriptTurnTable.$inferSelect>;
}) {
  const { debriefOutput, topics, transcriptRows } = options;

  if (debriefOutput) {
    const activeTopicIndex = debriefOutput.topicCoverage.findIndex(
      (topic) => topic.coverageOutcome !== "covered",
    );
    const coverageState = normalizeCoverageState(topics, {
      activeTopicIndex: activeTopicIndex >= 0 ? activeTopicIndex : null,
      coveragePendingReview: false,
      interviewComplete: debriefOutput.topicCoverage.every(
        (topic) => topic.coverageOutcome === "covered",
      ),
      topics: debriefOutput.topicCoverage.map((topic) => ({
        status: topic.coverageOutcome === "covered" ? "covered" : "not-started",
        topicLabel: topic.topic,
      })),
    });

    return coverageState;
  }

  const participantTurnCount = transcriptRows.filter((turn) => turn.role === "user").length;
  const coveredCount = Math.min(participantTurnCount, topics.length);

  return normalizeCoverageState(topics, {
    activeTopicIndex: coveredCount >= topics.length ? null : coveredCount,
    coveragePendingReview: false,
    interviewComplete: coveredCount >= topics.length,
    topics: topics.map((topicLabel, index) => ({
      status: index < coveredCount ? "covered" : "not-started",
      topicLabel,
    })),
  });
}

function buildSessionAnnotationInsert(options: {
  coverageState: ReturnType<typeof buildCoverageStateForSession>;
  sessionId: string;
  studyId: string;
  transcriptRows: Array<typeof transcriptTurnTable.$inferSelect>;
}) {
  const lastUserTurn = [...options.transcriptRows]
    .reverse()
    .find((turn) => turn.role === "user");
  const lastAssistantTurn = [...options.transcriptRows]
    .reverse()
    .find((turn) => turn.role === "assistant");

  if (!lastUserTurn || !lastAssistantTurn) {
    throw new Error("Demo session annotations require at least one assistant turn and one user turn.");
  }

  return {
    assistantTurnId: lastAssistantTurn.id,
    contradictions: [],
    coverageState: options.coverageState,
    createdAt: lastUserTurn.createdAt,
    emotionSignal: "low" as const,
    evidenceQuotes: [],
    id: buildId(options.studyId, options.sessionId, "annotation", "final"),
    progressState: deriveProgressStateFromCoverageState(options.coverageState),
    sessionId: options.sessionId,
    userTurnId: lastUserTurn.id,
  } satisfies typeof sessionAnnotationTable.$inferInsert;
}

function buildPlan(studyDefinition: DemoStudyDefinition) {
  return hydrateStudyPlanDerivedFields({
    ...studyDefinition.plan,
    studyId: studyDefinition.id,
    subtitle: PLAN_SUBTITLE,
    title: studyDefinition.title,
  });
}

function buildFallbackTopicCoverage(options: {
  completedSessionCount: number;
  topics: string[];
}) {
  return options.topics.map((topic, index) => ({
    evidence: 0,
    id: `${topic.toLowerCase().replace(/\s+/g, "-")}-${index}`,
    status: options.completedSessionCount > 0 ? "pending-analysis" : "not-explored",
    topic,
  })) satisfies NonNullable<typeof studyAggregateTable.$inferInsert.topicCoverage>;
}

function buildSessionArtifacts(options: {
  completedAt: Date;
  plan: StudyPlan;
  session: DemoSessionDefinition;
  studyDefinition: DemoStudyDefinition;
}): BuiltDemoSession {
  const { completedAt, plan, session, studyDefinition } = options;
  const sessionId = session.id;
  const transcriptRows = buildTranscriptRows({
    completedAt,
    sessionId,
    studyId: studyDefinition.id,
    turns: session.turns,
  });
  const participantLabel = `Participant ${String(session.participantNumber).padStart(2, "0")}`;
  const consentedAt = transcriptRows[0]?.createdAt ?? completedAt.toISOString();

  if (!session.debrief) {
    const coverageState = buildCoverageStateForSession({
      debriefOutput: null,
      topics: plan.topics,
      transcriptRows,
    });

    return {
      annotationInsert: buildSessionAnnotationInsert({
        coverageState,
        sessionId,
        studyId: studyDefinition.id,
        transcriptRows,
      }),
      debriefInsert: null,
      debriefOutput: null,
      profileInsert: {
        consentAccepted: true,
        consentedAt,
        id: buildId(studyDefinition.id, sessionId, "profile"),
        responses: session.participantResponses,
        sessionId,
      },
      sessionInsert: {
        completedAt: completedAt.toISOString(),
        createdAt: transcriptRows[0]?.createdAt ?? completedAt.toISOString(),
        id: sessionId,
        participantNumber: session.participantNumber,
        sessionStatus: "complete",
        studyId: studyDefinition.id,
        updatedAt: completedAt.toISOString(),
      },
      transcriptRows,
    } satisfies BuiltDemoSession;
  }

  const debriefOutput: SessionDebriefOutput = {
    ...session.debrief,
    reasoning: session.debrief.reasoning.map((row) => ({
      aiDecision: row.aiDecision,
      researchPurpose: row.researchPurpose,
      status: row.status,
      timestamp: resolveReasoningTimestamp(transcriptRows, row),
      trigger: row.trigger,
    })),
    topicCoverage: session.debrief.topicCoverage.map((topic) => ({
      ...topic,
      coverageOutcome:
        topic.coverageOutcome ?? (topic.status === "covered" ? "covered" : "not-covered"),
    })),
  };

  validateGeneratedSessionDebriefOutput({
    coverageState: buildCoverageStateForSession({
      debriefOutput,
      topics: plan.topics,
      transcriptRows,
    }),
    output: debriefOutput,
    plan,
    transcript: transcriptRows,
  });

  const coverageState = buildCoverageStateForSession({
    debriefOutput,
    topics: plan.topics,
    transcriptRows,
  });

  const debriefContent = buildSessionDebriefModel({
    output: debriefOutput,
    participantLabel,
    sessionId,
    studyId: studyDefinition.id,
    studyObjective: studyDefinition.objective,
    transcript: transcriptRows,
  });
  const debriefUpdatedAt = addMinutes(completedAt, 10).toISOString();

  return {
    annotationInsert: buildSessionAnnotationInsert({
      coverageState,
      sessionId,
      studyId: studyDefinition.id,
      transcriptRows,
    }),
    debriefInsert: {
      content: debriefContent,
      contradictions: debriefOutput.contradictions,
      createdAt: debriefUpdatedAt,
      emotionSignal: debriefOutput.emotionSignal,
      model: DEMO_DEBRIEF_MODEL,
      providerResponseId: buildId(studyDefinition.id, sessionId, "debrief"),
      sessionId,
      studyId: studyDefinition.id,
      updatedAt: debriefUpdatedAt,
    },
    debriefOutput,
    profileInsert: {
      consentAccepted: true,
      consentedAt,
      id: buildId(studyDefinition.id, sessionId, "profile"),
      responses: session.participantResponses,
      sessionId,
    },
    sessionInsert: {
      completedAt: completedAt.toISOString(),
      createdAt: transcriptRows[0]?.createdAt ?? completedAt.toISOString(),
      id: sessionId,
      participantNumber: session.participantNumber,
      sessionStatus: "complete",
      studyId: studyDefinition.id,
      updatedAt: completedAt.toISOString(),
    },
    transcriptRows,
  } satisfies BuiltDemoSession;
}

function buildStudyArtifacts(studyDefinition: DemoStudyDefinition, now: Date): BuiltDemoStudy {
  const plan = buildPlan(studyDefinition);
  const createdAt = subtractTime(now, studyDefinition.createdDaysAgo * DAY_MS).toISOString();
  const activeInviteExpiresAt = new Date(now.getTime() + 7 * DAY_MS).toISOString();
  const sessionArtifacts = studyDefinition.sessions
    .map((session) =>
      buildSessionArtifacts({
        completedAt: subtractTime(now, session.completedHoursAgo * HOUR_MS),
        plan,
        session,
        studyDefinition,
      }),
    )
    .sort((left, right) => left.sessionInsert.createdAt.localeCompare(right.sessionInsert.createdAt));
  const completedSessionCount = sessionArtifacts.length;
  const debriefArtifacts: Array<
    BuiltDemoSession & {
      debriefInsert: NonNullable<BuiltDemoSession["debriefInsert"]>;
      debriefOutput: NonNullable<BuiltDemoSession["debriefOutput"]>;
    }
  > = [];

  for (const item of sessionArtifacts) {
    if (!item.debriefInsert || !item.debriefOutput) {
      continue;
    }

    debriefArtifacts.push({
      ...item,
      debriefInsert: item.debriefInsert,
      debriefOutput: item.debriefOutput,
    });
  }
  const debriefs = debriefArtifacts.map((item) => item.debriefInsert.content);
  const topicCoverage =
    debriefs.length > 0
      ? buildStudyTopicCoverageFromDebriefs(plan.topics, debriefs)
      : buildFallbackTopicCoverage({
          completedSessionCount,
          topics: plan.topics,
        });
  const coverage = debriefs.length > 0 ? computeAggregateCoverageValue(topicCoverage) : 0;
  const contradictionCount = debriefArtifacts.reduce(
    (sum, item) => sum + item.debriefInsert.contradictions.length,
    0,
  );
  const signalCount = debriefArtifacts.filter(
    (item) => item.debriefInsert.emotionSignal !== "low",
  ).length;
  const updatedAtCandidates = sessionArtifacts.flatMap((item) => {
    const values = [item.sessionInsert.updatedAt];

    if (item.debriefInsert) {
      values.push(item.debriefInsert.updatedAt);
    }

    return values;
  });
  const updatedAt = updatedAtCandidates.length > 0 ? maxIso(updatedAtCandidates) : createdAt;

  return {
    aggregateInsert:
      studyDefinition.persistAggregate === false
        ? null
        : {
            completedSessionCount: debriefArtifacts.length,
            contradictionCount,
            coverage,
            hiddenThemesCount: Math.max(studyDefinition.allThemes.length - 3, 0),
            observation: studyDefinition.observation,
            signalCount,
            studyId: studyDefinition.id,
            themes: studyDefinition.allThemes.slice(0, 3),
            topicCoverage,
            updatedAt,
          },
    debriefInserts: debriefArtifacts.map((item) => item.debriefInsert),
    id: studyDefinition.id,
    participantFieldInserts: studyDefinition.participantFields.map((field, index) => ({
      helperText: field.helperText ?? null,
      id: buildId(studyDefinition.id, "field", field.id),
      label: field.label,
      options: field.options ?? null,
      placeholder: field.placeholder ?? null,
      required: field.required ?? false,
      sortOrder: index,
      studyId: studyDefinition.id,
      type: field.type,
      fieldKey: field.id,
    })),
    planContent: plan,
    planVersionInserts: [
      {
        content: plan,
        createdAt,
        id: buildId(studyDefinition.id, "plan", "draft"),
        isCurrent: true,
        kind: "draft",
        studyId: studyDefinition.id,
        updatedAt,
        versionNumber: 1,
      },
      {
        content: plan,
        createdAt,
        id: buildId(studyDefinition.id, "plan", "approved"),
        isCurrent: true,
        kind: "approved",
        studyId: studyDefinition.id,
        updatedAt,
        versionNumber: 1,
      },
    ],
    profileInserts: sessionArtifacts.map((item) => item.profileInsert),
    sessionArtifacts,
    sessionAnnotationInserts: sessionArtifacts.map((item) => item.annotationInsert),
    sessionInserts: sessionArtifacts.map((item) => item.sessionInsert),
    status: studyDefinition.status,
    studyInviteInsert:
      studyDefinition.status === "completed" || studyDefinition.status === "archived"
        ? null
        : {
            createdAt,
            expiresAt: activeInviteExpiresAt,
            id: buildId(studyDefinition.id, "invite", "active"),
            inviteCode: `SI${buildId(studyDefinition.id).replace(/_/g, "").slice(0, 10).toUpperCase()}`,
            revokedAt: null,
            studyId: studyDefinition.id,
          },
    studyInsert: {
      audience: studyDefinition.audience,
      context: studyDefinition.context,
      createdAt,
      durationMinutes: plan.estimatedDurationMinutes ?? 20,
      id: studyDefinition.id,
      interviewsTarget: studyDefinition.interviewsTarget,
      objective: studyDefinition.objective,
      slug: studyDefinition.id,
      status: studyDefinition.status,
      title: studyDefinition.title,
      updatedAt,
    },
    title: studyDefinition.title,
    topicInserts: plan.topics.map((topic, index) => ({
      id: buildId(studyDefinition.id, "topic", String(index + 1)),
      label: topic,
      sortOrder: index,
      studyId: studyDefinition.id,
    })),
    transcriptInserts: sessionArtifacts.flatMap((item) => item.transcriptRows),
  };
}

function buildBrandParticipantFields(
  extraFields: ParticipantIntakeField[],
): ParticipantIntakeField[] {
  return [
    {
      id: "preferredName",
      label: "Preferred name",
      placeholder: "e.g. Maya",
      required: true,
      type: "text",
    },
    {
      id: "ageRange",
      label: "Age range",
      options: [
        { label: "18-24", value: "18-24" },
        { label: "25-34", value: "25-34" },
        { label: "35-44", value: "35-44" },
        { label: "45+", value: "45-plus" },
      ],
      placeholder: "Select your age range",
      required: true,
      type: "select",
    },
    {
      id: "country",
      label: "Country",
      options: [
        { label: "United States", value: "US" },
        { label: "Canada", value: "CA" },
      ],
      placeholder: "Select your country",
      required: true,
      type: "select",
    },
    {
      id: "purchaseRecency",
      label: "Most recent category purchase",
      options: [
        { label: "Within 30 days", value: "within-30-days" },
        { label: "31-90 days ago", value: "31-90-days" },
        { label: "91-180 days ago", value: "91-180-days" },
      ],
      placeholder: "Choose one",
      required: true,
      type: "select",
    },
    {
      id: "categoryUsage",
      label: "How often do you buy this category?",
      options: [
        { label: "Multiple times a week", value: "multi-weekly" },
        { label: "About weekly", value: "weekly" },
        { label: "A few times a month", value: "monthly" },
        { label: "Less often", value: "less-often" },
      ],
      placeholder: "Choose one",
      required: true,
      type: "select",
    },
    {
      helperText: "Choose the option that best fits your relationship with our brand right now.",
      id: "brandRelationship",
      label: "Relationship with our brand",
      options: [
        { label: "Aware but never purchased", value: "aware-never-purchased" },
        { label: "Purchased once", value: "purchased-once" },
        { label: "Purchased a few times", value: "purchased-few-times" },
        { label: "Regular buyer", value: "regular-buyer" },
      ],
      required: true,
      type: "radio",
    },
    ...extraFields,
  ];
}

function buildConceptParticipantFields() {
  return buildBrandParticipantFields([
    {
      id: "afternoonSnackStyle",
      label: "What do you usually reach for in the afternoon?",
      options: [
        { label: "Sweet snack", value: "sweet" },
        { label: "Savory snack", value: "savory" },
        { label: "Protein-focused snack", value: "protein" },
      ],
      placeholder: "Choose one",
      required: true,
      type: "select",
    },
    {
      id: "portableBreakfastUse",
      label: "How often do you eat breakfast or snacks on the go?",
      options: [
        { label: "Most weekdays", value: "most-weekdays" },
        { label: "A few times a week", value: "few-times-week" },
        { label: "Rarely", value: "rarely" },
      ],
      placeholder: "Choose one",
      required: true,
      type: "select",
    },
  ]);
}

function buildSkincareParticipantFields() {
  return buildBrandParticipantFields([
    {
      id: "skinConcern",
      label: "Main skincare concern",
      options: [
        { label: "Dryness or barrier repair", value: "dryness-barrier" },
        { label: "Acne or congestion", value: "acne" },
        { label: "Tone or texture", value: "tone-texture" },
      ],
      placeholder: "Choose one",
      required: true,
      type: "select",
    },
    {
      id: "lastSerumBrand",
      label: "Most recent serum purchased",
      placeholder: "e.g. The Ordinary, La Roche-Posay",
      required: true,
      type: "text",
    },
    {
      id: "routineComplexity",
      label: "How many skincare steps do you usually keep in your nightly routine?",
      options: [
        { label: "1-2 steps", value: "1-2" },
        { label: "3-4 steps", value: "3-4" },
        { label: "5+ steps", value: "5-plus" },
      ],
      placeholder: "Choose one",
      required: true,
      type: "select",
    },
  ]);
}

function buildDenimParticipantFields() {
  return buildBrandParticipantFields([
    {
      id: "usualDenimFit",
      label: "Fit you buy most often",
      options: [
        { label: "Straight", value: "straight" },
        { label: "Wide leg", value: "wide-leg" },
        { label: "Slim or skinny", value: "slim-skinny" },
      ],
      placeholder: "Choose one",
      required: true,
      type: "select",
    },
    {
      id: "denimPurchaseChannel",
      label: "Where do you usually buy denim?",
      options: [
        { label: "Brand website", value: "brand-site" },
        { label: "Department store", value: "department-store" },
        { label: "Marketplace or retailer app", value: "marketplace" },
      ],
      placeholder: "Choose one",
      required: true,
      type: "select",
    },
    {
      id: "recentReturnReason",
      label: "Most recent reason you returned apparel",
      options: [
        { label: "Fit was off", value: "fit" },
        { label: "Fabric felt wrong", value: "fabric" },
        { label: "Looked different than expected", value: "expectation-gap" },
      ],
      placeholder: "Choose one",
      required: true,
      type: "select",
    },
  ]);
}

function buildPackagingParticipantFields() {
  return buildBrandParticipantFields([
    {
      id: "bodyCareFormat",
      label: "Body care format you buy most often",
      options: [
        { label: "Body wash", value: "body-wash" },
        { label: "Body lotion", value: "body-lotion" },
        { label: "Both equally", value: "both" },
      ],
      placeholder: "Choose one",
      required: true,
      type: "select",
    },
    {
      id: "refillExperience",
      label: "Have you bought refillable beauty or body care before?",
      options: [
        { label: "Yes, multiple times", value: "multiple-times" },
        { label: "Yes, once", value: "once" },
        { label: "No", value: "no" },
      ],
      placeholder: "Choose one",
      required: true,
      type: "select",
    },
    {
      id: "shoppingChannel",
      label: "Where did you buy the product?",
      options: [
        { label: "Brand website", value: "brand-site" },
        { label: "Sephora or Ulta", value: "beauty-retailer" },
        { label: "Gift or subscription box", value: "gift-box" },
      ],
      placeholder: "Choose one",
      required: true,
      type: "select",
    },
  ]);
}

function buildBeverageParticipantFields() {
  return buildBrandParticipantFields([
    {
      id: "favoriteSparklingBrand",
      label: "Brand you buy most often today",
      placeholder: "e.g. LaCroix, Spindrift, Waterloo",
      required: true,
      type: "text",
    },
    {
      id: "sweetnessPreference",
      label: "What level of sweetness do you usually want?",
      options: [
        { label: "Unsweetened", value: "unsweetened" },
        { label: "Lightly sweetened", value: "lightly-sweetened" },
        { label: "Sweetened like soda", value: "sweet-soda" },
      ],
      placeholder: "Choose one",
      required: true,
      type: "select",
    },
    {
      id: "purchaseChannel",
      label: "Where do you most often buy sparkling drinks?",
      options: [
        { label: "Grocery store", value: "grocery" },
        { label: "Club store", value: "club" },
        { label: "Convenience store", value: "convenience" },
      ],
      placeholder: "Choose one",
      required: true,
      type: "select",
    },
  ]);
}

const demoStudyDefinitions: DemoStudyDefinition[] = [
  {
    allThemes: [
      "Afternoon energy need",
      "Skepticism toward cereal protein claims",
      "Portable spoonable convenience",
      "Trial depends on grocery discoverability",
      "Value tied to satiety",
    ],
    audience: "US adults 25-44 who buy portable snacks at least weekly",
    context:
      "Our snack brand is exploring a refrigerated protein cereal cup line extension for afternoon snackers who want something filling but convenient.",
    createdDaysAgo: 8,
    id: "demo-protein-cereal-concept",
    interviewsTarget: 4,
    objective:
      "Understand how afternoon snack shoppers react to our protein cereal cup concept and what would make our brand feel worth trying in that moment.",
    observation:
      "The study is framed to learn whether our concept earns trial through satiety, portability, and brand credibility before we invest in launch messaging.",
    participantFields: buildConceptParticipantFields(),
    persistAggregate: false,
    plan: {
      estimatedDurationMinutes: 20,
      exampleProbes: [
        "What are you usually trying to solve when that afternoon snack moment hits?",
        "What about this concept feels more believable or less believable coming from our brand?",
        "How would you expect this package to fit into the places you normally snack?",
        "What would make the protein claim feel worth paying attention to?",
        "What would have to be true for you to try this instead of your current go-to?",
      ],
      hypotheses: [
        "Afternoon snack shoppers will respond to our concept when it feels like a practical bridge between hunger and dinner.",
        "Participants will question whether cereal can credibly deliver protein without tasting engineered.",
        "Portable spoonable packaging will matter more than novelty when deciding whether our product fits real routines.",
        "Trial will depend on whether our brand feels trusted enough to stretch into a more functional snack role.",
      ],
      mustCoverAreas: [
        "Capture the real afternoon occasion our concept would need to win.",
        "Understand which parts of the concept feel credible versus gimmicky.",
        "Learn how packaging format affects portability and cleanup expectations.",
        "Identify the price range that still feels like an easy first try.",
        "Surface what retail context would make shoppers notice our concept quickly.",
      ],
      objective:
        "Understand how afternoon snack shoppers react to our protein cereal cup concept and what would make our brand feel worth trying in that moment.",
      openingQuestion:
        "Tell me about the last time you needed a snack in the middle of the afternoon?",
      probingStrategy: [
        "Anchor on the participant's latest real snack moment before discussing the concept.",
        "Separate what feels emotionally appealing from what feels practically credible.",
        "Probe how brand trust changes willingness to try a new format.",
        "Ask what would have to change for the concept to replace an existing habit.",
      ],
      selectedBehaviorId: "ask-for-examples",
      selectedTone: "warm and commercially curious",
      thingsToAvoid: [
        "Do not sell the concept or defend its nutrition positioning.",
        "Do not assume cereal automatically belongs in breakfast rather than snacking.",
        "Do not collapse portability, satiety, and taste into one generic value claim.",
        "Do not let packaging opinions replace discussion of the actual snack occasion.",
      ],
      topics: [
        "Current afternoon snack routine",
        "Concept first impression",
        "Protein and cereal credibility",
        "Pack format and portability",
        "Price and trial threshold",
        "Retail shelf cue",
      ],
    },
    sessions: [],
    status: "planning",
    title: "How should we position our protein cereal cup for afternoon snackers?",
  },
  {
    allThemes: [
      "Results take too long to prove themselves",
      "Routine friction blocks habit formation",
      "Value disappears when the bottle feels short-lived",
      "Reorder requires a visible skin payoff",
      "Calming texture is a positive hook",
    ],
    audience: "US adults 25-44 who bought a prestige skincare serum in the last 90 days",
    context:
      "Our skincare brand launched a barrier repair serum and wants to understand why trial is not turning into repeat purchase.",
    createdDaysAgo: 6,
    id: "demo-skincare-repeat-purchase",
    interviewsTarget: 4,
    objective:
      "Understand why first-time buyers stop short of reordering our barrier repair serum after the initial trial period.",
    observation:
      "Early users want our serum to prove itself quickly inside an already crowded routine, and reorder hesitation grows when results feel subtle or the bottle runs out faster than expected.",
    participantFields: buildSkincareParticipantFields(),
    plan: {
      estimatedDurationMinutes: 24,
      exampleProbes: [
        "What was happening in your skin routine when you decided to try our serum?",
        "When did you first start judging whether our product was working for you?",
        "What made our texture or application feel easy or annoying to keep up with?",
        "How did you decide whether the bottle had delivered enough value to rebuy?",
        "What would have made reordering our serum feel obvious instead of debatable?",
      ],
      hypotheses: [
        "First-time buyers expect our barrier repair story to produce reassurance faster than their skin can visibly change.",
        "Participants will stop using our serum consistently when it adds one more decision into an already full routine.",
        "Reorder hesitation will increase when the bottle feels short-lived relative to the premium price.",
        "Sensory positives alone will not create repeat purchase unless the participant can point to a visible payoff.",
      ],
      mustCoverAreas: [
        "Understand the trigger that got our serum into the basket the first time.",
        "Identify the exact moment participants started evaluating whether our product worked.",
        "Capture how our serum fit into the rest of the nightly routine.",
        "Separate value concerns from efficacy concerns in the reorder decision.",
        "Learn what proof or reassurance would have pushed participants into a second purchase.",
      ],
      objective:
        "Understand why first-time buyers stop short of reordering our barrier repair serum after the initial trial period.",
      openingQuestion:
        "Tell me about the moment you first decided to buy our barrier repair serum?",
      probingStrategy: [
        "Start with the lived purchase trigger before discussing performance claims.",
        "Ask for concrete usage moments instead of general skincare opinions.",
        "Probe whether non-reorder came from weak results, weak fit, or weak value.",
        "Look for the point where curiosity about our serum stopped turning into habit.",
      ],
      selectedBehaviorId: "challenge-contradictions",
      selectedTone: "calm and probing",
      thingsToAvoid: [
        "Do not imply that non-reorder means the participant used our serum incorrectly.",
        "Do not over-index on ingredient literacy before understanding lived results.",
        "Do not treat premium price as the only reason our product was not repurchased.",
        "Do not skip over routine context in favor of only before-and-after claims.",
      ],
      topics: [
        "Trial purchase trigger",
        "First-week expectation",
        "Visible efficacy timeline",
        "Routine fit and sensory experience",
        "Value versus price",
        "Reorder trigger",
      ],
    },
    sessions: [
      {
        completedHoursAgo: 40,
        debrief: {
          contradictions: [
            "She wanted our serum to simplify her routine, but judged it harshly when it asked for steady nightly use.",
            "She liked the calming texture from our product, yet would not reorder without faster visible proof.",
          ],
          emotionSignal: "medium",
          evidence: [
            {
              followUp: "What kind of earlier proof would have made our serum feel worth sticking with?",
              label: "Results window felt too long",
              quote: "By week three I was still asking if anything was actually changing.",
              theme: "Results take too long to prove themselves",
              whyItMatters: "Our serum entered the routine with a repair promise, but the participant reached a verdict before the benefit felt visible.",
            },
            {
              followUp: "What part of the routine made our serum easiest to drop first?",
              label: "Routine friction broke consistency",
              quote: "If I was tired, our serum was the easiest step to skip because it felt like one more thing to wait on.",
              theme: "Routine friction blocks habit formation",
              whyItMatters: "The product sits in a vulnerable middle position where minor friction can kill the habit before reorder becomes likely.",
            },
            {
              followUp: "What would have made the bottle feel more worth the spend?",
              label: "Bottle value felt compressed",
              quote: "The bottle looked premium, but it ran out fast enough that I started doing the math.",
              theme: "Value disappears when the bottle feels short-lived",
              whyItMatters: "The participant converted price into cost-per-use and decided our product had not earned the second purchase.",
            },
          ],
          interviewQuality: {
            coverage: "Covered all six topics with direct examples from purchase to non-reorder.",
            depth: "Strong depth on efficacy timing and routine fit.",
            participantEngagement: "Reflective and specific throughout the interview.",
          },
          keyTakeaway:
            "Lena liked the calming feel of our serum, but our brand did not prove enough visible payoff before routine friction and value math took over.",
          missedAreas: [
            "Whether stronger onboarding guidance from our brand could have reset the results expectation.",
          ],
          recommendedFollowUp: [
            "Test messaging that sets a more realistic proof timeline for our serum without weakening excitement.",
            "Explore whether a tighter usage ritual or progress cue helps our product stay in the nightly routine long enough to earn reorder.",
          ],
          reasoning: [
            {
              aiDecision: "Stayed with the first purchase story before moving into product judgment.",
              pairIndex: 0,
              researchPurpose: "Understand what job the participant hired our serum to do.",
              source: "participant",
              status: "completed",
              trigger: "The participant framed the purchase as a rescue move for irritated skin.",
            },
            {
              aiDecision: "Probed the week-three checkpoint because that sounded like the moment our product was being measured.",
              pairIndex: 2,
              researchPurpose: "Identify when our serum lost momentum inside the trial window.",
              source: "assistant",
              status: "completed",
              trigger: "The participant named a specific point when doubt about results appeared.",
            },
            {
              aiDecision: "Closed on reorder economics instead of abstract brand affinity.",
              pairIndex: 4,
              researchPurpose: "Translate hesitation into a decision threshold our team can act on.",
              source: "participant",
              status: "completed",
              trigger: "The participant explicitly compared bottle life to price before deciding not to rebuy.",
            },
          ],
          topicCoverage: [
            { topic: "Trial purchase trigger", status: "covered", evidenceStrength: "high", score: 4 },
            { topic: "First-week expectation", status: "covered", evidenceStrength: "high", score: 4 },
            { topic: "Visible efficacy timeline", status: "covered", evidenceStrength: "high", score: 5 },
            {
              topic: "Routine fit and sensory experience",
              status: "covered",
              evidenceStrength: "high",
              score: 4,
            },
            { topic: "Value versus price", status: "covered", evidenceStrength: "high", score: 4 },
            { topic: "Reorder trigger", status: "in-progress", evidenceStrength: "medium", score: 3 },
          ],
          topThemes: [
            { label: "Results take too long to prove themselves", score: 4, strength: "high" },
            { label: "Routine friction blocks habit formation", score: 3, strength: "medium" },
            { label: "Value disappears when the bottle feels short-lived", score: 2, strength: "low" },
          ],
          whyThisMatters:
            "Our team cannot rely on texture and brand polish alone; repeat purchase depends on helping shoppers see enough progress before the trial window closes.",
        },
        id: "demo-skincare-p01",
        participantNumber: 1,
        participantResponses: {
          ageRange: "25-34",
          brandRelationship: "purchased-once",
          categoryUsage: "monthly",
          country: "US",
          lastSerumBrand: "La Roche-Posay",
          preferredName: "Lena",
          purchaseRecency: "within-30-days",
          routineComplexity: "3-4",
          skinConcern: "dryness-barrier",
        },
        turns: [
          {
            assistant: "Tell me about the moment you first decided to buy our barrier repair serum.",
            participant:
              "My skin was angry from overdoing actives, and our serum looked like the calming reset I needed without switching everything else out.",
          },
          {
            assistant: "What did you expect our serum to do in that first week or two?",
            participant:
              "I expected it to make my face feel less tight fast. I did like the texture, but I was also waiting for a sign that it was really doing something.",
          },
          {
            assistant: "When did you start judging whether our product was working enough to keep going?",
            participant:
              "By week three I was still asking if anything was actually changing. That's when I started wondering if our serum was just nice to use instead of necessary.",
          },
          {
            assistant: "How did our serum fit into the rest of your routine once the novelty wore off?",
            participant:
              "If I was tired, our serum was the easiest step to skip because it felt like one more thing to wait on.",
          },
          {
            assistant: "What pushed you away from reordering when the bottle got low?",
            participant:
              "The bottle looked premium, but it ran out fast enough that I started doing the math. I couldn't point to a big enough payoff to order it again.",
          },
        ],
      },
      {
        completedHoursAgo: 26,
        debrief: {
          contradictions: [
            "He says he wants a simple routine, but still buys into our higher-performance promise when the claim feels concrete.",
          ],
          emotionSignal: "low",
          evidence: [
            {
              followUp: "What kind of routine cue would have made our serum easier to keep using?",
              label: "Habit never locked in",
              quote: "I used our serum consistently for maybe ten days, then it became the thing I forgot first.",
              theme: "Routine friction blocks habit formation",
              whyItMatters: "Our product failed to earn a fixed slot in the routine before the participant started pruning steps.",
            },
            {
              followUp: "What would have counted as enough visible proof from our serum to keep going?",
              label: "Calm feel did not equal convincing result",
              quote: "It felt soothing, but soothing isn't the same as seeing a reason to rebuy.",
              theme: "Results take too long to prove themselves",
              whyItMatters: "A positive sensory experience did not convert into durable belief that our brand delivered real efficacy.",
            },
            {
              followUp: "How would our brand need to frame bottle life to feel more justified?",
              label: "Reorder lost on value comparison",
              quote: "Once I realized our bottle would last maybe a month, I just went back to the serum I already trust.",
              theme: "Value disappears when the bottle feels short-lived",
              whyItMatters: "Our serum is being benchmarked against an incumbent favorite with clearer value certainty.",
            },
          ],
          interviewQuality: {
            coverage: "Covered five topics strongly with lighter detail on initial purchase trigger.",
            depth: "Good depth on habit loss and incumbent comparison.",
            participantEngagement: "Direct and practical rather than emotional.",
          },
          keyTakeaway:
            "Marcus was open to our brand, but our serum never became essential enough to displace the product he already trusted.",
          missedAreas: [
            "The exact retail or content touchpoint that first convinced him to try our serum.",
          ],
          recommendedFollowUp: [
            "Test whether our reorder messaging should focus on clearer progress cues rather than broad soothing language.",
            "Compare reactions to a smaller trial size versus a value-oriented refill or bundle for our serum.",
          ],
          reasoning: [
            {
              aiDecision: "Moved quickly into routine behavior because the participant framed skincare as a simplification exercise.",
              pairIndex: 1,
              researchPurpose: "See whether our product won a stable role or a temporary test slot.",
              source: "participant",
              status: "completed",
              trigger: "The participant repeatedly described pruning steps once the routine felt crowded.",
            },
            {
              aiDecision: "Asked about the trusted fallback serum to understand the real comparison set for our brand.",
              pairIndex: 4,
              researchPurpose: "Clarify what our product had to beat to earn repeat purchase.",
              source: "assistant",
              status: "completed",
              trigger: "The participant mentioned returning to an incumbent rather than abandoning serum altogether.",
            },
            {
              aiDecision: "Marked the trial trigger as thinner evidence instead of stretching the story.",
              pairIndex: 0,
              researchPurpose: "Keep the debrief grounded in the strongest signals from the interview.",
              source: "participant",
              status: "planned",
              trigger: "The participant gave less detail on the first purchase moment than on the non-reorder decision.",
            },
          ],
          topicCoverage: [
            { topic: "Trial purchase trigger", status: "weak-evidence", evidenceStrength: "low", score: 1 },
            { topic: "First-week expectation", status: "covered", evidenceStrength: "high", score: 4 },
            { topic: "Visible efficacy timeline", status: "in-progress", evidenceStrength: "medium", score: 3 },
            {
              topic: "Routine fit and sensory experience",
              status: "covered",
              evidenceStrength: "high",
              score: 4,
            },
            { topic: "Value versus price", status: "covered", evidenceStrength: "high", score: 4 },
            { topic: "Reorder trigger", status: "covered", evidenceStrength: "high", score: 4 },
          ],
          topThemes: [
            { label: "Routine friction blocks habit formation", score: 4, strength: "high" },
            { label: "Results take too long to prove themselves", score: 3, strength: "medium" },
            { label: "Reorder requires a visible skin payoff", score: 2, strength: "low" },
          ],
          whyThisMatters:
            "Our serum is not just fighting category churn; it is competing against an already-trusted routine staple that feels easier to justify.",
        },
        id: "demo-skincare-p02",
        participantNumber: 2,
        participantResponses: {
          ageRange: "35-44",
          brandRelationship: "purchased-once",
          categoryUsage: "monthly",
          country: "US",
          lastSerumBrand: "Paula's Choice",
          preferredName: "Marcus",
          purchaseRecency: "31-90-days",
          routineComplexity: "1-2",
          skinConcern: "dryness-barrier",
        },
        turns: [
          {
            assistant: "What made our serum interesting enough to try the first time?",
            participant:
              "I was trying to calm down some winter dryness, and our brand description made it sound more targeted than a basic hydrating serum.",
          },
          {
            assistant: "How did our product fit into your routine once you brought it home?",
            participant:
              "I keep my routine pretty lean. I used our serum consistently for maybe ten days, then it became the thing I forgot first.",
          },
          {
            assistant: "What did you notice or not notice as you kept using it?",
            participant:
              "It felt soothing, but soothing isn't the same as seeing a reason to rebuy. I never got to a moment where I thought, yes, this changed something.",
          },
          {
            assistant: "How did price and bottle life factor into the decision once you were running low?",
            participant:
              "It wasn't outrageously expensive, but it also didn't last long enough to feel casual. I started comparing it to what else that money gets me.",
          },
          {
            assistant: "What did you end up doing instead of reordering our serum?",
            participant:
              "Once I realized our bottle would last maybe a month, I just went back to the serum I already trust.",
          },
        ],
      },
    ],
    status: "interviewing",
    title: "Why are first-time buyers not reordering our barrier repair serum?",
  },
  {
    allThemes: [
      "Size chart confidence collapses at the waist",
      "Stretch recovery changes after real wear",
      "Returns feel acceptable but still interrupt trust",
      "Denim photos over-promise leg shape",
      "Rebuy depends on fit naming clarity",
    ],
    audience: "US women 24-39 who bought denim online and returned or exchanged at least one pair in the last 6 months",
    context:
      "Our apparel brand is trying to reduce fit-related returns on a new everyday denim franchise sold primarily through our site.",
    createdDaysAgo: 5,
    id: "demo-denim-fit-returns",
    interviewsTarget: 3,
    objective:
      "Understand what keeps shoppers from keeping our everyday denim after the first try-on and what would restore confidence in buying our jeans again.",
    observation:
      "Shoppers start optimistic because our styling is appealing, but our fit language breaks down around waist precision, leg silhouette, and whether the fabric behaves the same after an hour of wear.",
    participantFields: buildDenimParticipantFields(),
    plan: {
      estimatedDurationMinutes: 23,
      exampleProbes: [
        "How did you decide which size of our denim to order the first time?",
        "What did you expect our jeans to feel or look like before you tried them on?",
        "What was the first moment our fit stopped matching the picture in your head?",
        "How did the fabric change after you moved around in our jeans for a bit?",
        "What would have to change for you to trust ordering our denim again?",
      ],
      hypotheses: [
        "Shoppers rely on our size chart until the first waist mismatch makes the chart feel unreliable.",
        "Participants will accept some initial break-in if our denim silhouette still matches the styled expectation from the site.",
        "Return friction will matter less than the emotional disappointment of our fit promise missing in a visible way.",
        "Confidence to reorder our denim will depend on clearer fit naming and more believable body-shape cues.",
      ],
      mustCoverAreas: [
        "Capture how shoppers translated our size guidance into the chosen size.",
        "Identify the first part of the try-on where our jeans felt wrong.",
        "Understand whether the problem sat in fit, fabric behavior, or both.",
        "Learn how much the return process softened or compounded disappointment with our brand.",
        "Surface what proof would make a future denim order from our site feel safer.",
      ],
      objective:
        "Understand what keeps shoppers from keeping our everyday denim after the first try-on and what would restore confidence in buying our jeans again.",
      openingQuestion:
        "Tell me about the last time you ordered our denim and opened the package to try it on?",
      probingStrategy: [
        "Follow the try-on sequence step by step before generalizing about denim preferences.",
        "Separate the participant's belief in our fit guidance from the return experience itself.",
        "Probe both the mirror moment and the after-an-hour movement check.",
        "Look for what would rebuild trust in our denim without assuming the answer is more discounts.",
      ],
      selectedBehaviorId: "ask-for-examples",
      selectedTone: "direct and curious",
      thingsToAvoid: [
        "Do not assume a return means the participant disliked the overall style direction from our brand.",
        "Do not treat size-chart failure and silhouette disappointment as the same issue.",
        "Do not jump to shipping or policy talk before understanding the fit break.",
        "Do not flatten denim fit into one generic comfort complaint.",
      ],
      topics: [
        "Size selection strategy",
        "Expectation before try-on",
        "Fit at waist and leg",
        "Fabric feel after wear",
        "Return and exchange effort",
        "Confidence to buy again",
      ],
    },
    sessions: [
      {
        completedHoursAgo: 34,
        debrief: {
          contradictions: [
            "She trusted our size chart enough to order without backup sizes, but lost trust quickly when the waist felt off immediately.",
          ],
          emotionSignal: "medium",
          evidence: [
            {
              followUp: "What kind of waist guidance from our brand would have felt more believable before ordering?",
              label: "Size chart trust broke at the waist",
              quote: "I picked my usual size because our chart said the waist would be true, but it pinched right away.",
              theme: "Size chart confidence collapses at the waist",
              whyItMatters: "The participant gave our fit guidance one clean chance and treated the mismatch as evidence that future orders are risky.",
            },
            {
              followUp: "What would have made our site photos feel more honest about the leg shape?",
              label: "Silhouette promise felt overstated",
              quote: "The leg looked straighter online than it did on me in my mirror.",
              theme: "Denim photos over-promise leg shape",
              whyItMatters: "Our styling imagery set a silhouette expectation the real product did not meet.",
            },
            {
              followUp: "What would have to happen after the first try-on for you to trust our denim again?",
              label: "Return was easy but trust still dropped",
              quote: "Returning them was easy enough, but easy doesn't mean I want to keep guessing with our jeans.",
              theme: "Returns feel acceptable but still interrupt trust",
              whyItMatters: "A smooth return policy did not recover confidence once our fit promise failed.",
            },
          ],
          interviewQuality: {
            coverage: "Covered all six topics with strong detail on fit and confidence loss.",
            depth: "High depth on size guidance and silhouette mismatch.",
            participantEngagement: "Candid and concrete with clear recall of the try-on.",
          },
          keyTakeaway:
            "Brianna did not mind initiating a return, but our brand lost trust when the waist fit and leg silhouette both contradicted what the site implied.",
          missedAreas: [
            "Whether different inseam photography from our brand would have changed the chosen style.",
          ],
          recommendedFollowUp: [
            "Test richer waist fit language and model comparisons on our denim PDPs.",
            "Explore whether post-purchase fit reassurance can recover confidence before the first return becomes a habit.",
          ],
          reasoning: [
            {
              aiDecision: "Stayed on the chart-to-try-on handoff because that is where trust either holds or collapses for our brand.",
              pairIndex: 0,
              researchPurpose: "Map the first credibility break in the denim journey.",
              source: "participant",
              status: "completed",
              trigger: "The participant described a direct conflict between our chart promise and the first fit sensation.",
            },
            {
              aiDecision: "Asked about mirror versus site imagery to separate size issues from silhouette disappointment.",
              pairIndex: 2,
              researchPurpose: "Understand whether our product photography amplified the return risk.",
              source: "assistant",
              status: "completed",
              trigger: "The participant contrasted what she expected from our site with what she saw at home.",
            },
            {
              aiDecision: "Closed on future trust rather than the logistics of the return label.",
              pairIndex: 4,
              researchPurpose: "Learn what would make another order from our brand feel safe.",
              source: "participant",
              status: "completed",
              trigger: "The participant made it clear that operational ease did not restore confidence.",
            },
          ],
          topicCoverage: [
            { topic: "Size selection strategy", status: "covered", evidenceStrength: "high", score: 4 },
            { topic: "Expectation before try-on", status: "covered", evidenceStrength: "high", score: 4 },
            { topic: "Fit at waist and leg", status: "covered", evidenceStrength: "high", score: 5 },
            { topic: "Fabric feel after wear", status: "in-progress", evidenceStrength: "medium", score: 2 },
            { topic: "Return and exchange effort", status: "covered", evidenceStrength: "high", score: 4 },
            { topic: "Confidence to buy again", status: "covered", evidenceStrength: "high", score: 4 },
          ],
          topThemes: [
            { label: "Size chart confidence collapses at the waist", score: 4, strength: "high" },
            { label: "Denim photos over-promise leg shape", score: 3, strength: "medium" },
            { label: "Returns feel acceptable but still interrupt trust", score: 2, strength: "low" },
          ],
          whyThisMatters:
            "Our team should not assume an easy return policy solves the problem when the core issue is a broken fit promise on first try-on.",
        },
        id: "demo-denim-p01",
        participantNumber: 1,
        participantResponses: {
          ageRange: "25-34",
          brandRelationship: "purchased-once",
          categoryUsage: "monthly",
          country: "US",
          denimPurchaseChannel: "brand-site",
          preferredName: "Brianna",
          purchaseRecency: "within-30-days",
          recentReturnReason: "fit",
          usualDenimFit: "straight",
        },
        turns: [
          {
            assistant: "Tell me about the last time you ordered our denim and opened the package to try it on.",
            participant:
              "I picked my usual size because our chart said the waist would be true, but it pinched right away.",
          },
          {
            assistant: "What had you expected before the jeans were actually on your body?",
            participant:
              "I expected a relaxed straight fit that still looked polished. Online it felt like our jeans would be the easy everyday pair.",
          },
          {
            assistant: "What was the first thing that made you feel that expectation was off?",
            participant:
              "The leg looked straighter online than it did on me in my mirror. It felt closer to stiff slim denim than the picture suggested.",
          },
          {
            assistant: "How did the fabric feel once you moved around in it for a bit?",
            participant:
              "It softened a little, but not enough to change my mind. I kept thinking that if the waist already felt wrong, I wasn't going to gamble on it settling in.",
          },
          {
            assistant: "How did that experience affect whether you'd order our denim again?",
            participant:
              "Returning them was easy enough, but easy doesn't mean I want to keep guessing with our jeans.",
          },
        ],
      },
      {
        completedHoursAgo: 22,
        debrief: {
          contradictions: [
            "She liked the softness of our fabric after wear, but still returned the jeans because the shape never felt like the version our site sold her.",
          ],
          emotionSignal: "low",
          evidence: [
            {
              followUp: "What about our size guidance made you hedge with two sizes?",
              label: "Sizing still felt uncertain before purchase",
              quote: "I ordered two sizes because I couldn't tell how forgiving our waist would be.",
              theme: "Size chart confidence collapses at the waist",
              whyItMatters: "The participant spent money and effort compensating for uncertainty before the package even arrived.",
            },
            {
              followUp: "What changed after moving around in our denim for an hour?",
              label: "Fabric softened but shape stayed wrong",
              quote: "The fabric got more comfortable after an hour, but the seat still looked flatter than I wanted from our jeans.",
              theme: "Stretch recovery changes after real wear",
              whyItMatters: "Comfort improved, but the aesthetic outcome from our product still failed the test.",
            },
            {
              followUp: "What would our brand need to show for you to risk ordering again?",
              label: "Future buy depends on clearer fit naming",
              quote: "If our site explained who this fit is actually for, I'd give the brand one more shot.",
              theme: "Rebuy depends on fit naming clarity",
              whyItMatters: "The participant is open to the brand, but only if our fit language becomes more trustworthy.",
            },
          ],
          interviewQuality: {
            coverage: "Covered all major topics with the strongest detail on fit expectations and future trust.",
            depth: "Good depth on pre-purchase hedging and after-wear evaluation.",
            participantEngagement: "Measured but specific.",
          },
          keyTakeaway:
            "Talia saw promise in our denim, but our fit naming and body-shape cues were not clear enough to make the first experience feel predictable.",
          missedAreas: [
            "How much our exchange flow versus full return flow would change willingness to retry.",
          ],
          recommendedFollowUp: [
            "Test clearer fit personas and model-callout language on our denim assortment pages.",
            "Explore whether our team should highlight after-wear comfort separately from silhouette expectations.",
          ],
          reasoning: [
            {
              aiDecision: "Followed the two-size purchase decision because it revealed mistrust before the first try-on.",
              pairIndex: 0,
              researchPurpose: "Identify pre-purchase compensation behaviors around our sizing.",
              source: "participant",
              status: "completed",
              trigger: "The participant described ordering multiple sizes as a risk-management tactic.",
            },
            {
              aiDecision: "Separated comfort improvement from silhouette satisfaction after wear.",
              pairIndex: 3,
              researchPurpose: "Prevent our team from misreading softness gains as a full product win.",
              source: "assistant",
              status: "completed",
              trigger: "The participant reported better comfort without better shape confidence.",
            },
            {
              aiDecision: "Closed on the fit language our brand would need to change.",
              pairIndex: 4,
              researchPurpose: "Turn dissatisfaction into a more specific merchandising opportunity.",
              source: "participant",
              status: "completed",
              trigger: "The participant volunteered a concrete condition for giving our brand another chance.",
            },
          ],
          topicCoverage: [
            { topic: "Size selection strategy", status: "covered", evidenceStrength: "high", score: 4 },
            { topic: "Expectation before try-on", status: "covered", evidenceStrength: "high", score: 4 },
            { topic: "Fit at waist and leg", status: "covered", evidenceStrength: "high", score: 4 },
            { topic: "Fabric feel after wear", status: "covered", evidenceStrength: "high", score: 4 },
            { topic: "Return and exchange effort", status: "in-progress", evidenceStrength: "medium", score: 2 },
            { topic: "Confidence to buy again", status: "covered", evidenceStrength: "high", score: 4 },
          ],
          topThemes: [
            { label: "Rebuy depends on fit naming clarity", score: 4, strength: "high" },
            { label: "Stretch recovery changes after real wear", score: 3, strength: "medium" },
            { label: "Size chart confidence collapses at the waist", score: 2, strength: "low" },
          ],
          whyThisMatters:
            "Our denim assortment likely needs sharper fit communication, not just softer fabric claims, to convert cautious shoppers into repeat buyers.",
        },
        id: "demo-denim-p02",
        participantNumber: 2,
        participantResponses: {
          ageRange: "25-34",
          brandRelationship: "aware-never-purchased",
          categoryUsage: "monthly",
          country: "US",
          denimPurchaseChannel: "brand-site",
          preferredName: "Talia",
          purchaseRecency: "31-90-days",
          recentReturnReason: "expectation-gap",
          usualDenimFit: "wide-leg",
        },
        turns: [
          {
            assistant: "How did you decide what size of our denim to order?",
            participant:
              "I ordered two sizes because I couldn't tell how forgiving our waist would be.",
          },
          {
            assistant: "What were you hoping our jeans would look like once they were on?",
            participant:
              "I wanted that easy loose look from your site, where it still skims the waist but doesn't feel sloppy anywhere else.",
          },
          {
            assistant: "What happened at the actual try-on?",
            participant:
              "One size cut into my waist and the other lost shape in the leg. It felt like neither version landed where our styling made me think it would.",
          },
          {
            assistant: "Did anything change after you wore them around for a bit?",
            participant:
              "The fabric got more comfortable after an hour, but the seat still looked flatter than I wanted from our jeans.",
          },
          {
            assistant: "What would our brand need to do for you to order denim again?",
            participant:
              "If our site explained who this fit is actually for, I'd give the brand one more shot.",
          },
        ],
      },
      {
        completedHoursAgo: 12,
        id: "demo-denim-p03",
        participantNumber: 3,
        participantResponses: {
          ageRange: "35-44",
          brandRelationship: "purchased-few-times",
          categoryUsage: "monthly",
          country: "US",
          denimPurchaseChannel: "department-store",
          preferredName: "Nora",
          purchaseRecency: "within-30-days",
          recentReturnReason: "fit",
          usualDenimFit: "straight",
        },
        turns: [
          {
            assistant: "What made you try our everyday denim this time?",
            participant:
              "I've liked tops from your brand before, so I assumed the jeans would feel just as easy.",
          },
          {
            assistant: "How did you pick a size and style?",
            participant:
              "I used the chart and picked the straight fit because it sounded safest for me.",
          },
          {
            assistant: "What happened when you tried the jeans on?",
            participant:
              "The waist was okay, but the thigh felt tighter than I expected and the leg opened lower than I wanted.",
          },
          {
            assistant: "How did that affect what you did next?",
            participant:
              "I set them aside for two days before returning them because I wanted to convince myself I was overreacting.",
          },
          {
            assistant: "What would need to change for you to trust our denim again?",
            participant:
              "I need a clearer sense of what body shape each fit is really built for, not just a style adjective.",
          },
        ],
      },
    ],
    status: "analyzing",
    title: "What keeps shoppers from keeping our everyday denim after the first try-on?",
  },
  {
    allThemes: [
      "Outer carton sets premium expectations",
      "Unboxing pace signals care and giftability",
      "Refill instructions need instant clarity",
      "Bathroom display value supports the price",
      "Sustainability matters when it feels effortless",
    ],
    audience: "US adults 25-44 who bought premium body care in the last 90 days",
    context:
      "Our beauty brand launched a refillable body wash system and wants to understand how the first unboxing experience shapes premium perception and future purchase intent.",
    createdDaysAgo: 4,
    id: "demo-beauty-packaging-unboxing",
    interviewsTarget: 2,
    objective:
      "Understand how shoppers interpret our refillable body wash packaging at first open and which packaging moments make our brand feel premium, intuitive, or cumbersome.",
    observation:
      "The unboxing experience is doing real brand work for us: when the carton, bottle, and refill story land clearly, shoppers justify the premium and picture the product on display in their bathroom.",
    participantFields: buildPackagingParticipantFields(),
    plan: {
      estimatedDurationMinutes: 18,
      exampleProbes: [
        "What did you notice first when you picked up our package?",
        "How did the first few seconds of opening our box make you feel about the brand?",
        "What part of the refill story felt obvious or confusing from our packaging?",
        "How much did display value in your bathroom matter to the purchase?",
        "What would have made our packaging feel even more giftable or shareable?",
      ],
      hypotheses: [
        "Shoppers will use our outer packaging as an immediate read on whether the refill system is worth premium pricing.",
        "Participants will tolerate extra steps when our unboxing feels intentional and display-worthy.",
        "Confusion about how the refill works will weaken confidence in the sustainability story from our brand.",
        "Bathroom display value and giftability will act as secondary justifications for choosing our product.",
      ],
      mustCoverAreas: [
        "Capture the first visual cue participants used to judge our packaging quality.",
        "Understand the emotional tone of opening our carton and handling the bottle.",
        "Learn where the refill explanation feels clear versus mentally taxing.",
        "Identify whether display value makes our price feel more acceptable.",
        "Surface whether shoppers imagine sharing, gifting, or talking about our packaging.",
      ],
      objective:
        "Understand how shoppers interpret our refillable body wash packaging at first open and which packaging moments make our brand feel premium, intuitive, or cumbersome.",
      openingQuestion:
        "Tell me about the first moment you opened our refillable body wash package?",
      probingStrategy: [
        "Walk through the unboxing sequence in order rather than skipping to summary opinions.",
        "Separate premium perception from sustainability perception when discussing our packaging.",
        "Probe where delight turns into confusion in the refill story.",
        "Ask how the product earns its place in the bathroom after the first open.",
      ],
      selectedBehaviorId: "probe-emotional-language",
      selectedTone: "warm and observant",
      thingsToAvoid: [
        "Do not treat sustainability approval as proof that the refill design is intuitive.",
        "Do not over-focus on copy before understanding the physical opening sequence.",
        "Do not assume premium packaging only matters for gifting rather than self-use.",
        "Do not collapse confusion about the refill pouch into a generic dislike of instructions.",
      ],
      topics: [
        "Shelf expectation",
        "Outer pack cues",
        "Opening ritual",
        "Refill understanding",
        "Countertop display value",
        "Gifting or sharing behavior",
      ],
    },
    sessions: [
      {
        completedHoursAgo: 30,
        debrief: {
          contradictions: [
            "She says sustainability matters, but only when our refill system feels almost frictionless.",
          ],
          emotionSignal: "medium",
          evidence: [
            {
              followUp: "What would make the refill step from our brand feel as intuitive as the first open?",
              label: "Premium carton bought us attention",
              quote: "The box made me slow down in a good way. It felt like our brand cared about the first minute.",
              theme: "Outer carton sets premium expectations",
              whyItMatters: "Our outer pack created enough perceived care to justify attention and soften the premium price.",
            },
            {
              followUp: "What part of our refill explanation almost lost you?",
              label: "Refill story needed faster clarity",
              quote: "I understood the refill eventually, but I had to stop and read more closely than I wanted.",
              theme: "Refill instructions need instant clarity",
              whyItMatters: "The participant wanted the refill idea to feel elegant; extra reading introduced cognitive friction into our sustainability promise.",
            },
            {
              followUp: "How much does bathroom display value matter when deciding to repurchase our product?",
              label: "Display value supports premium price",
              quote: "Once the bottle was on my shower shelf, I got why it costs more.",
              theme: "Bathroom display value supports the price",
              whyItMatters: "Our product earns value not just through function but through the in-home brand impression after unboxing.",
            },
          ],
          interviewQuality: {
            coverage: "Covered all six topics with balanced detail across delight and confusion.",
            depth: "Strong depth on premium perception and refill clarity.",
            participantEngagement: "Engaged and visually descriptive.",
          },
          keyTakeaway:
            "Our packaging made Julia feel like she bought something elevated, but the refill explanation still needs to become more immediate if we want the sustainability story to feel effortless.",
          missedAreas: [
            "Whether stronger on-pack iconography from our brand would change gifting appeal.",
          ],
          recommendedFollowUp: [
            "Test lighter-weight refill onboarding cues directly on the carton and bottle.",
            "Explore how much the display moment in the shower contributes to repeat purchase versus initial trial.",
          ],
          reasoning: [
            {
              aiDecision: "Stayed on the first minute of opening because the participant described it as emotionally meaningful.",
              pairIndex: 0,
              researchPurpose: "Capture the exact packaging moment where our brand signals premium.",
              source: "participant",
              status: "completed",
              trigger: "The participant described slowing down and paying attention during unboxing.",
            },
            {
              aiDecision: "Probed the refill explanation after delight surfaced to see where elegance broke.",
              pairIndex: 2,
              researchPurpose: "Find the handoff between premium feel and operational confusion.",
              source: "assistant",
              status: "completed",
              trigger: "The participant clearly separated how our packaging looked from how the refill step felt.",
            },
            {
              aiDecision: "Closed on in-shower display value because that framed why the premium held up later.",
              pairIndex: 4,
              researchPurpose: "Understand the post-unboxing value story supporting our price.",
              source: "participant",
              status: "completed",
              trigger: "The participant connected countertop display directly to value perception.",
            },
          ],
          topicCoverage: [
            { topic: "Shelf expectation", status: "covered", evidenceStrength: "high", score: 4 },
            { topic: "Outer pack cues", status: "covered", evidenceStrength: "high", score: 4 },
            { topic: "Opening ritual", status: "covered", evidenceStrength: "high", score: 4 },
            { topic: "Refill understanding", status: "in-progress", evidenceStrength: "medium", score: 3 },
            { topic: "Countertop display value", status: "covered", evidenceStrength: "high", score: 4 },
            { topic: "Gifting or sharing behavior", status: "weak-evidence", evidenceStrength: "low", score: 1 },
          ],
          topThemes: [
            { label: "Outer carton sets premium expectations", score: 4, strength: "high" },
            { label: "Refill instructions need instant clarity", score: 3, strength: "medium" },
            { label: "Bathroom display value supports the price", score: 2, strength: "low" },
          ],
          whyThisMatters:
            "Our brand is already winning on first impression; the next gain comes from making the refill step feel as polished as the rest of the package.",
        },
        id: "demo-packaging-p01",
        participantNumber: 1,
        participantResponses: {
          ageRange: "25-34",
          bodyCareFormat: "body-wash",
          brandRelationship: "purchased-once",
          categoryUsage: "monthly",
          country: "US",
          preferredName: "Julia",
          purchaseRecency: "within-30-days",
          refillExperience: "once",
          shoppingChannel: "brand-site",
        },
        turns: [
          {
            assistant: "Tell me about the first moment you opened our refillable body wash package.",
            participant:
              "The box made me slow down in a good way. It felt like our brand cared about the first minute.",
          },
          {
            assistant: "What did that make you expect from the product before you even used it?",
            participant:
              "I expected something more premium than a normal body wash, like the bottle would feel like decor and not just shower clutter.",
          },
          {
            assistant: "How did the refill part land once you got further into the package?",
            participant:
              "I understood the refill eventually, but I had to stop and read more closely than I wanted.",
          },
          {
            assistant: "How did that affect what you thought about the sustainability angle from our brand?",
            participant:
              "I like the idea, but if the refill step feels fiddly I know I'll drift back to whatever is easiest.",
          },
          {
            assistant: "What stuck with you after the product was actually in your shower?",
            participant:
              "Once the bottle was on my shower shelf, I got why it costs more.",
          },
        ],
      },
      {
        completedHoursAgo: 18,
        debrief: {
          contradictions: [
            "He bought our product partly for the refill story, but judged the package mostly through giftability and display rather than sustainability alone.",
          ],
          emotionSignal: "low",
          evidence: [
            {
              followUp: "What exactly did our package signal that made it feel giftable?",
              label: "Unboxing pace felt intentional",
              quote: "Opening it felt paced, like our brand wanted each piece to have a moment.",
              theme: "Unboxing pace signals care and giftability",
              whyItMatters: "Our packaging created a sense of ceremony that can amplify premium and social-share value.",
            },
            {
              followUp: "Which instruction from our refill setup still needs simplification?",
              label: "Refill was clearer after handling than by reading",
              quote: "I understood our refill more once I touched everything than from the first block of copy.",
              theme: "Refill instructions need instant clarity",
              whyItMatters: "Physical affordance helps, but our brand should not depend on trial-and-error during first open.",
            },
            {
              followUp: "How much does bathroom display from our product matter after the novelty wears off?",
              label: "Display supports self-gifting logic",
              quote: "It looks expensive in the bathroom, which weirdly makes me feel like the splurge was smart.",
              theme: "Bathroom display value supports the price",
              whyItMatters: "The product reinforces its own value visually after unboxing, which supports retention and word of mouth.",
            },
          ],
          interviewQuality: {
            coverage: "Covered all key topics with especially clear detail on ritual and display.",
            depth: "Moderate depth on refill comprehension and strong depth on premium cues.",
            participantEngagement: "Specific and expressive.",
          },
          keyTakeaway:
            "Our packaging worked as self-gifting and display-driven premium design for Owen, but the refill setup still needs to explain itself faster on first touch.",
          missedAreas: [
            "Whether different outer-pack claims from our brand would strengthen explicit sustainability value.",
          ],
          recommendedFollowUp: [
            "Test alternate carton hierarchies that explain the refill system in one fast scan.",
            "Explore whether gifting-oriented language from our brand increases trial or just reinforces premium perception after purchase.",
          ],
          reasoning: [
            {
              aiDecision: "Stayed with the unboxing sequence because the participant described our packaging almost like a ritual.",
              pairIndex: 0,
              researchPurpose: "Understand how our brand creates emotional lift through pacing and reveal.",
              source: "participant",
              status: "completed",
              trigger: "The participant emphasized tempo and sequence rather than only visual design.",
            },
            {
              aiDecision: "Asked how understanding changed after touching the refill components.",
              pairIndex: 2,
              researchPurpose: "Separate copy clarity from physical affordance in our setup.",
              source: "assistant",
              status: "completed",
              trigger: "The participant implied the refill made more sense physically than verbally.",
            },
            {
              aiDecision: "Closed on the self-gifting logic because it explained why the premium still felt justified.",
              pairIndex: 4,
              researchPurpose: "Clarify how in-home display supports value for our brand.",
              source: "participant",
              status: "completed",
              trigger: "The participant tied visible bathroom presence directly to purchase validation.",
            },
          ],
          topicCoverage: [
            { topic: "Shelf expectation", status: "covered", evidenceStrength: "high", score: 4 },
            { topic: "Outer pack cues", status: "covered", evidenceStrength: "high", score: 4 },
            { topic: "Opening ritual", status: "covered", evidenceStrength: "high", score: 5 },
            { topic: "Refill understanding", status: "in-progress", evidenceStrength: "medium", score: 2 },
            { topic: "Countertop display value", status: "covered", evidenceStrength: "high", score: 4 },
            { topic: "Gifting or sharing behavior", status: "covered", evidenceStrength: "high", score: 4 },
          ],
          topThemes: [
            { label: "Unboxing pace signals care and giftability", score: 4, strength: "high" },
            { label: "Bathroom display value supports the price", score: 3, strength: "medium" },
            { label: "Refill instructions need instant clarity", score: 2, strength: "low" },
          ],
          whyThisMatters:
            "Our packaging is not just protective; it is a meaningful part of the premium experience our team is selling, so clarity problems inside the ritual become especially costly.",
        },
        id: "demo-packaging-p02",
        participantNumber: 2,
        participantResponses: {
          ageRange: "35-44",
          bodyCareFormat: "both",
          brandRelationship: "purchased-few-times",
          categoryUsage: "monthly",
          country: "US",
          preferredName: "Owen",
          purchaseRecency: "31-90-days",
          refillExperience: "multiple-times",
          shoppingChannel: "beauty-retailer",
        },
        turns: [
          {
            assistant: "What was your first reaction when you started opening our package?",
            participant:
              "Opening it felt paced, like our brand wanted each piece to have a moment.",
          },
          {
            assistant: "How did that shape what you thought about the product itself?",
            participant:
              "It made it feel giftable, even though I bought it for myself. I immediately thought this was the kind of thing you'd leave out instead of hide.",
          },
          {
            assistant: "How clear did the refill concept feel during that first open?",
            participant:
              "I understood our refill more once I touched everything than from the first block of copy.",
          },
          {
            assistant: "What did that mean for the sustainability promise from our brand?",
            participant:
              "It still felt smart, but I wanted less reading and more instant confidence that I knew how to use it.",
          },
          {
            assistant: "What stayed with you after the package was gone and the bottle was in use?",
            participant:
              "It looks expensive in the bathroom, which weirdly makes me feel like the splurge was smart.",
          },
        ],
      },
    ],
    status: "completed",
    title: "How does our refillable body wash packaging shape the first unboxing experience?",
  },
  {
    allThemes: [
      "Incumbent habit is harder to break than first trial",
      "Flavor needs sharper differentiation",
      "Health cues invite trial but not loyalty",
      "Price-per-case governs pantry commitment",
      "Brand fit depends on weekly meal occasions",
    ],
    audience: "US adults 25-44 who buy sparkling water at least weekly",
    context:
      "Our beverage brand wants to understand why sparkling water shoppers will try us once but stay loyal to their usual brand on the next grocery trip.",
    createdDaysAgo: 3,
    id: "demo-sparkling-water-switching",
    interviewsTarget: 2,
    objective:
      "Understand what triggers first trial of our sparkling water and what stops that first positive impression from turning into a routine switch.",
    observation:
      "Our brand is getting permission to trial through fresh flavor cues and better-for-you positioning, but habitual shoppers still return to the incumbent that owns their weekly pantry routine and case-price logic.",
    participantFields: buildBeverageParticipantFields(),
    plan: {
      estimatedDurationMinutes: 19,
      exampleProbes: [
        "What got our can into your cart the first time instead of your usual brand?",
        "How did the flavor from our drink compare with what you expected from the front of the pack?",
        "What role did the health or ingredient story from our brand play after the first sip?",
        "How did you compare our price and pack size with your regular option?",
        "What would have to change for our brand to become part of your weekly routine?",
      ],
      hypotheses: [
        "Shoppers will try our sparkling water when flavor naming and health cues make the product feel fresher than their usual brand.",
        "Participants will return to incumbents when our taste difference feels interesting but not routine-worthy.",
        "Pack price and pantry role will matter more than one-time curiosity when deciding whether to switch.",
        "Our brand will win repeat only when shoppers can map the drink to a stable weekly occasion rather than a novelty experiment.",
      ],
      mustCoverAreas: [
        "Capture the exact trigger for the first trial of our product.",
        "Understand how the first sip compared with what our pack promised.",
        "Separate the role of our health cues from the role of flavor enjoyment.",
        "Learn how case price and pack size affect commitment to our brand.",
        "Identify the occasion where our drink could displace the usual brand in a recurring way.",
      ],
      objective:
        "Understand what triggers first trial of our sparkling water and what stops that first positive impression from turning into a routine switch.",
      openingQuestion:
        "Tell me about the first time you decided to buy our sparkling water instead of your usual brand?",
      probingStrategy: [
        "Start with the cart decision before discussing overall beverage preferences.",
        "Probe taste, health cues, and pantry economics as separate decision layers.",
        "Ask what role the drink played in actual meals or daily routines.",
        "Look for what would make our brand feel dependable enough to earn repeat space.",
      ],
      selectedBehaviorId: "stay-neutral",
      selectedTone: "neutral and commercially sharp",
      thingsToAvoid: [
        "Do not assume a positive first sip means our brand is close to winning routine share.",
        "Do not collapse pack price and pack size into one generic value judgment.",
        "Do not over-credit health language if flavor fit is doing the real work.",
        "Do not treat all sparkling water occasions as interchangeable.",
      ],
      topics: [
        "Current sparkling water repertoire",
        "First trial trigger",
        "Flavor expectation versus taste",
        "Health cue credibility",
        "Price and pack comparison",
        "Role in weekly routine",
      ],
    },
    sessions: [
      {
        completedHoursAgo: 24,
        debrief: {
          contradictions: [
            "She liked our cleaner ingredient story, but still chose her usual brand when stocking up for the week.",
          ],
          emotionSignal: "low",
          evidence: [
            {
              followUp: "What would make our flavor feel distinct enough to claim a real slot in your cart?",
              label: "Trial came from curiosity, not routine need",
              quote: "I grabbed our can because the flavor sounded brighter than what I normally buy.",
              theme: "Flavor needs sharper differentiation",
              whyItMatters: "Our brand won the first cart decision through curiosity, but that same curiosity may not be enough to create routine preference.",
            },
            {
              followUp: "What part of our better-for-you story mattered after the first case was gone?",
              label: "Health cues opened the door",
              quote: "Our ingredient list made me feel good about trying it, but taste still decides what stays in the fridge.",
              theme: "Health cues invite trial but not loyalty",
              whyItMatters: "The better-for-you narrative gets us considered, but repeat depends on more than label reassurance.",
            },
            {
              followUp: "How would our pricing need to change to feel like a weekly staple?",
              label: "Weekly stock-up falls back to incumbent math",
              quote: "When I'm buying for the whole week, I still default to the cheaper case I already know everyone will drink.",
              theme: "Price-per-case governs pantry commitment",
              whyItMatters: "Our brand is losing at the pantry-fill moment where case economics and household certainty dominate.",
            },
          ],
          interviewQuality: {
            coverage: "Covered all six topics with the strongest detail on trial trigger and pantry economics.",
            depth: "Good depth on curiosity versus habit.",
            participantEngagement: "Practical and specific.",
          },
          keyTakeaway:
            "Sofia gave our sparkling water an honest try, but our brand still felt like a fun one-off compared with the safer weekly stock-up choice.",
          missedAreas: [
            "Whether our brand could win a smaller single-can or mixed-pack role before case purchase.",
          ],
          recommendedFollowUp: [
            "Test whether sharper flavor cues or mixed-pack entry points make our brand feel less like a one-time experiment.",
            "Explore how our team should communicate value when the purchase moment is a pantry stock-up rather than a single impulse try.",
          ],
          reasoning: [
            {
              aiDecision: "Stayed with the cart trigger because that is where our brand broke into the repertoire.",
              pairIndex: 0,
              researchPurpose: "Understand how the first trial opportunity opens up.",
              source: "participant",
              status: "completed",
              trigger: "The participant described a very specific flavor-led reason for buying our can.",
            },
            {
              aiDecision: "Separated health reassurance from flavor repeat potential.",
              pairIndex: 2,
              researchPurpose: "Prevent our team from mistaking permission to try for permission to switch.",
              source: "assistant",
              status: "completed",
              trigger: "The participant described our ingredients positively but still reserved judgment on routine fit.",
            },
            {
              aiDecision: "Closed on the weekly stock-up decision because that is where incumbents keep winning.",
              pairIndex: 4,
              researchPurpose: "Clarify the economic threshold for our brand to earn pantry space.",
              source: "participant",
              status: "completed",
              trigger: "The participant explicitly contrasted impulse trial with whole-week buying behavior.",
            },
          ],
          topicCoverage: [
            {
              topic: "Current sparkling water repertoire",
              status: "covered",
              evidenceStrength: "high",
              score: 4,
            },
            { topic: "First trial trigger", status: "covered", evidenceStrength: "high", score: 4 },
            {
              topic: "Flavor expectation versus taste",
              status: "in-progress",
              evidenceStrength: "medium",
              score: 3,
            },
            { topic: "Health cue credibility", status: "covered", evidenceStrength: "high", score: 4 },
            { topic: "Price and pack comparison", status: "covered", evidenceStrength: "high", score: 4 },
            { topic: "Role in weekly routine", status: "covered", evidenceStrength: "high", score: 4 },
          ],
          topThemes: [
            { label: "Price-per-case governs pantry commitment", score: 4, strength: "high" },
            { label: "Health cues invite trial but not loyalty", score: 3, strength: "medium" },
            { label: "Flavor needs sharper differentiation", score: 2, strength: "low" },
          ],
          whyThisMatters:
            "Our team should distinguish between winning a curious first sip and winning the pantry-loading decision that actually creates share.",
        },
        id: "demo-sparkling-p01",
        participantNumber: 1,
        participantResponses: {
          ageRange: "25-34",
          brandRelationship: "purchased-once",
          categoryUsage: "weekly",
          country: "US",
          favoriteSparklingBrand: "Spindrift",
          preferredName: "Sofia",
          purchaseChannel: "grocery",
          purchaseRecency: "within-30-days",
          sweetnessPreference: "unsweetened",
        },
        turns: [
          {
            assistant: "Tell me about the first time you decided to buy our sparkling water instead of your usual brand.",
            participant:
              "I grabbed our can because the flavor sounded brighter than what I normally buy.",
          },
          {
            assistant: "How did our drink compare with what you expected from the pack once you tasted it?",
            participant:
              "It was good, just not wildly different. I liked it, but I wasn't suddenly rethinking my whole fridge.",
          },
          {
            assistant: "What role did the ingredient or health story from our brand play?",
            participant:
              "Our ingredient list made me feel good about trying it, but taste still decides what stays in the fridge.",
          },
          {
            assistant: "How did our pack price compare with what you usually buy?",
            participant:
              "A single can felt fine, but the multi-pack didn't feel like the easy default when I was doing a bigger grocery run.",
          },
          {
            assistant: "What happens when you're buying sparkling water for the whole week?",
            participant:
              "When I'm buying for the whole week, I still default to the cheaper case I already know everyone will drink.",
          },
        ],
      },
      {
        completedHoursAgo: 16,
        debrief: {
          contradictions: [
            "He wants more interesting flavors from our category, but chooses the incumbent when our taste does not connect to a repeatable meal occasion.",
          ],
          emotionSignal: "medium",
          evidence: [
            {
              followUp: "Which occasion from our brand could realistically become part of your weekly routine?",
              label: "Routine fit matters more than novelty",
              quote: "I liked our flavor, but I couldn't picture exactly when I'd reach for it every week.",
              theme: "Brand fit depends on weekly meal occasions",
              whyItMatters: "Our beverage needs a stable job in the routine, not just a positive reaction in the moment.",
            },
            {
              followUp: "What made our pack feel healthier without feeling indispensable?",
              label: "Health halo is not enough to switch",
              quote: "Our can looked cleaner and more premium, but that didn't automatically make it my default.",
              theme: "Health cues invite trial but not loyalty",
              whyItMatters: "Premium and wellness cues help our brand earn attention, but they do not close the switch on their own.",
            },
            {
              followUp: "What would our flavor need to do differently to beat your usual brand?",
              label: "Incumbent habit stayed stronger",
              quote: "My usual brand still wins because I know exactly how it fits lunch and late afternoon.",
              theme: "Incumbent habit is harder to break than first trial",
              whyItMatters: "Habit strength comes from repeated occasion fit, not from raw category satisfaction alone.",
            },
          ],
          interviewQuality: {
            coverage: "Covered all major topics with especially strong detail on routine occasions.",
            depth: "Strong depth on occasion fit and incumbent comparison.",
            participantEngagement: "High; thoughtful and comparative.",
          },
          keyTakeaway:
            "Devon enjoyed our sparkling water, but our brand still lacks a specific weekly occasion strong enough to displace the incumbent in his routine.",
          missedAreas: [
            "Whether our brand could win in smaller on-the-go formats before at-home packs.",
          ],
          recommendedFollowUp: [
            "Test messaging and merchandising that tie our sparkling water to a clearer meal or afternoon occasion.",
            "Explore whether our flavor portfolio needs stronger distinction or simply sharper routine framing from our brand.",
          ],
          reasoning: [
            {
              aiDecision: "Followed the weekly occasion language because it explained the difference between liking and switching.",
              pairIndex: 1,
              researchPurpose: "Pin down where our brand fails to become habitual.",
              source: "participant",
              status: "completed",
              trigger: "The participant kept returning to specific lunch and afternoon consumption patterns.",
            },
            {
              aiDecision: "Separated can design from beverage role in the routine.",
              pairIndex: 2,
              researchPurpose: "Avoid mistaking premium brand cues for lasting behavior change.",
              source: "assistant",
              status: "completed",
              trigger: "The participant praised our look but still described switching barriers.",
            },
            {
              aiDecision: "Closed on the incumbent's routine advantage instead of asking for more generic flavor feedback.",
              pairIndex: 4,
              researchPurpose: "Understand the real competitive moat our brand must overcome.",
              source: "participant",
              status: "completed",
              trigger: "The participant described the incumbent in terms of dependable occasions, not just taste preference.",
            },
          ],
          topicCoverage: [
            {
              topic: "Current sparkling water repertoire",
              status: "covered",
              evidenceStrength: "high",
              score: 4,
            },
            { topic: "First trial trigger", status: "covered", evidenceStrength: "high", score: 4 },
            {
              topic: "Flavor expectation versus taste",
              status: "covered",
              evidenceStrength: "high",
              score: 4,
            },
            { topic: "Health cue credibility", status: "covered", evidenceStrength: "high", score: 4 },
            {
              topic: "Price and pack comparison",
              status: "in-progress",
              evidenceStrength: "medium",
              score: 2,
            },
            { topic: "Role in weekly routine", status: "covered", evidenceStrength: "high", score: 5 },
          ],
          topThemes: [
            { label: "Incumbent habit is harder to break than first trial", score: 4, strength: "high" },
            { label: "Brand fit depends on weekly meal occasions", score: 3, strength: "medium" },
            { label: "Health cues invite trial but not loyalty", score: 2, strength: "low" },
          ],
          whyThisMatters:
            "Our brand is close to relevance but not yet to routine; we need a clearer repeatable occasion if we want trial to convert into real share.",
        },
        id: "demo-sparkling-p02",
        participantNumber: 2,
        participantResponses: {
          ageRange: "35-44",
          brandRelationship: "purchased-once",
          categoryUsage: "weekly",
          country: "US",
          favoriteSparklingBrand: "Waterloo",
          preferredName: "Devon",
          purchaseChannel: "club",
          purchaseRecency: "31-90-days",
          sweetnessPreference: "lightly-sweetened",
        },
        turns: [
          {
            assistant: "What made you pick our sparkling water up the first time?",
            participant:
              "I wanted something that felt a little more elevated than the plain flavors I keep around all the time.",
          },
          {
            assistant: "How did our drink fit or not fit into the moments you usually reach for sparkling water?",
            participant:
              "I liked our flavor, but I couldn't picture exactly when I'd reach for it every week.",
          },
          {
            assistant: "What did the can and brand cues suggest to you before and after tasting it?",
            participant:
              "Our can looked cleaner and more premium, but that didn't automatically make it my default.",
          },
          {
            assistant: "How did price and pack logic factor into that decision?",
            participant:
              "For a one-off pack it was fine, but once I think about stocking up I get more practical pretty quickly.",
          },
          {
            assistant: "What keeps your usual brand in the lead today?",
            participant:
              "My usual brand still wins because I know exactly how it fits lunch and late afternoon.",
          },
        ],
      },
    ],
    status: "completed",
    title: "Why do sparkling water shoppers try us once but stay with their usual brand?",
  },
];

export const DEMO_STUDY_IDS = demoStudyDefinitions.map((study) => study.id);

export function buildDemoStudies(now = new Date()): BuiltDemoStudy[] {
  return demoStudyDefinitions.map((definition) => buildStudyArtifacts(definition, now));
}
