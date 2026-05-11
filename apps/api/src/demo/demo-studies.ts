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
  study as studyTable,
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

const MINUTE_MS = 60_000;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;

const DEMO_DEBRIEF_MODEL = "demo-debrief-seed-v1";
const DEMO_INTERVIEW_MODEL = "demo-interviewer-seed-v1";
const PLAN_SUBTITLE = "AI-generated plan tailored to your research objective";

type TranscriptRole = "assistant" | "user";
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

type SessionOutputTemplate = Omit<SessionDebriefOutput, "reasoning"> & {
  reasoning: ReasoningTemplate[];
};

type DemoSessionDefinition = {
  completedHoursAgo: number;
  debrief: SessionOutputTemplate;
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
  plan: Omit<StudyPlan, "studyId" | "subtitle" | "title">;
  sessions: DemoSessionDefinition[];
  status: StudyStatus;
  title: string;
};

export type BuiltDemoSession = {
  debriefInsert: typeof debriefReportTable.$inferInsert;
  debriefOutput: SessionDebriefOutput;
  profileInsert: typeof participantProfileTable.$inferInsert;
  sessionInsert: typeof interviewSessionTable.$inferInsert;
  transcriptRows: Array<typeof transcriptTurnTable.$inferSelect>;
};

export type BuiltDemoStudy = {
  aggregateInsert: typeof studyAggregateTable.$inferInsert;
  debriefInserts: Array<typeof debriefReportTable.$inferInsert>;
  id: string;
  participantFieldInserts: Array<typeof participantFieldTable.$inferInsert>;
  planContent: StudyPlan;
  planVersionInserts: Array<typeof studyPlanVersionTable.$inferInsert>;
  profileInserts: Array<typeof participantProfileTable.$inferInsert>;
  sessionArtifacts: BuiltDemoSession[];
  sessionInserts: Array<typeof interviewSessionTable.$inferInsert>;
  status: StudyStatus;
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

function buildPlan(studyDefinition: DemoStudyDefinition) {
  return hydrateStudyPlanDerivedFields({
    ...studyDefinition.plan,
    studyId: studyDefinition.id,
    subtitle: PLAN_SUBTITLE,
    title: studyDefinition.title,
  });
}

function buildSessionArtifacts(options: {
  completedAt: Date;
  plan: StudyPlan;
  session: DemoSessionDefinition;
  studyDefinition: DemoStudyDefinition;
}) {
  const { completedAt, plan, session, studyDefinition } = options;
  const sessionId = session.id;
  const transcriptRows = buildTranscriptRows({
    completedAt,
    sessionId,
    studyId: studyDefinition.id,
    turns: session.turns,
  });
  const debriefOutput: SessionDebriefOutput = {
    ...session.debrief,
    reasoning: session.debrief.reasoning.map((row) => ({
      aiDecision: row.aiDecision,
      researchPurpose: row.researchPurpose,
      status: row.status,
      timestamp: resolveReasoningTimestamp(transcriptRows, row),
      trigger: row.trigger,
    })),
  };

  validateGeneratedSessionDebriefOutput({
    output: debriefOutput,
    plan,
    transcript: transcriptRows,
  });

  const participantLabel = `Participant ${String(session.participantNumber).padStart(2, "0")}`;
  const debriefContent = buildSessionDebriefModel({
    output: debriefOutput,
    participantLabel,
    sessionId,
    studyId: studyDefinition.id,
    studyObjective: studyDefinition.objective,
    transcript: transcriptRows,
  });
  const consentedAt = transcriptRows[0]?.createdAt ?? completedAt.toISOString();
  const debriefUpdatedAt = addMinutes(completedAt, 10).toISOString();

  return {
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

  const debriefs = sessionArtifacts.map((item) => item.debriefInsert.content);
  const topicCoverage = buildStudyTopicCoverageFromDebriefs(plan.topics, debriefs);
  const coverage = computeAggregateCoverageValue(topicCoverage);
  const contradictionCount = sessionArtifacts.reduce(
    (sum, item) => sum + item.debriefInsert.contradictions.length,
    0,
  );
  const signalCount = sessionArtifacts.filter(
    (item) => item.debriefInsert.emotionSignal !== "low",
  ).length;
  const updatedAt = maxIso(
    sessionArtifacts.flatMap((item) => [
      item.sessionInsert.updatedAt,
      item.debriefInsert.updatedAt,
    ]),
  );
  const aggregateThemes = studyDefinition.allThemes.slice(0, 3);
  const hiddenThemesCount = Math.max(studyDefinition.allThemes.length - aggregateThemes.length, 0);

  return {
    aggregateInsert: {
      completedSessionCount: sessionArtifacts.length,
      contradictionCount,
      coverage,
      hiddenThemesCount,
      observation: studyDefinition.observation,
      signalCount,
      studyId: studyDefinition.id,
      themes: aggregateThemes,
      topicCoverage,
      updatedAt,
    },
    debriefInserts: sessionArtifacts.map((item) => item.debriefInsert),
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
    sessionInserts: sessionArtifacts.map((item) => item.sessionInsert),
    status: studyDefinition.status,
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

function buildBudgetingParticipantFields(): ParticipantIntakeField[] {
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
      ],
      placeholder: "Select your age range",
      required: true,
      type: "select",
    },
    {
      id: "country",
      label: "Country",
      options: [{ label: "United States", value: "US" }],
      placeholder: "Select your country",
      required: true,
      type: "select",
    },
    {
      id: "currentMoneyTool",
      label: "How do you track spending today?",
      options: [
        { label: "Budgeting app", value: "budgeting-app" },
        { label: "Notes or spreadsheet", value: "manual" },
        { label: "Mostly in my head", value: "mental" },
      ],
      placeholder: "Choose an option",
      required: true,
      type: "select",
    },
    {
      id: "lastBudgetingApp",
      label: "Most recent budgeting app used",
      placeholder: "e.g. Rocket Money, YNAB",
      required: true,
      type: "text",
    },
    {
      helperText: "Pick the option that feels closest right now.",
      id: "budgetingConfidence",
      label: "How confident do you feel managing your budget?",
      options: [
        { label: "Low", value: "low" },
        { label: "Medium", value: "medium" },
        { label: "High", value: "high" },
      ],
      required: true,
      type: "radio",
    },
  ];
}

function buildManagerParticipantFields(): ParticipantIntakeField[] {
  return [
    {
      id: "preferredName",
      label: "Preferred name",
      placeholder: "e.g. Eric",
      required: true,
      type: "text",
    },
    {
      id: "ageRange",
      label: "Age range",
      options: [
        { label: "25-34", value: "25-34" },
        { label: "35-44", value: "35-44" },
        { label: "45+", value: "45+" },
      ],
      placeholder: "Select your age range",
      required: true,
      type: "select",
    },
    {
      id: "country",
      label: "Country",
      options: [{ label: "United States", value: "US" }],
      placeholder: "Select your country",
      required: true,
      type: "select",
    },
    {
      id: "roleTitle",
      label: "Role title",
      placeholder: "e.g. Engineering Manager",
      required: true,
      type: "text",
    },
    {
      id: "teamSize",
      label: "Direct report count",
      options: [
        { label: "1-3", value: "1-3" },
        { label: "4-6", value: "4-6" },
        { label: "7-10", value: "7-10" },
      ],
      placeholder: "Choose a team size",
      required: true,
      type: "select",
    },
    {
      id: "managerTenure",
      label: "How long have you been managing people?",
      options: [
        { label: "Under 1 year", value: "under-1-year" },
        { label: "1-2 years", value: "1-2-years" },
        { label: "3+ years", value: "3-plus-years" },
      ],
      placeholder: "Choose a tenure range",
      required: true,
      type: "select",
    },
    {
      helperText: "Think about difficult or corrective feedback specifically.",
      id: "feedbackConfidence",
      label: "How confident do you feel giving hard feedback?",
      options: [
        { label: "Low", value: "low" },
        { label: "Medium", value: "medium" },
        { label: "High", value: "high" },
      ],
      required: true,
      type: "radio",
    },
  ];
}

const demoStudyDefinitions: DemoStudyDefinition[] = [
  {
    allThemes: [
      "Shame avoidance",
      "Automation trust gap",
      "Budget upkeep fatigue",
      "Category mismatch",
      "Low-friction reset moments",
    ],
    audience: "US adults 18-25 who used a budgeting app in the last 6 months",
    context: "Consumer mobile budgeting apps such as Rocket Money, YNAB, and similar tools",
    createdDaysAgo: 6,
    id: "demo-budgeting-app-dropoff",
    interviewsTarget: 3,
    objective:
      "Understand the emotional and practical reasons Gen Z users abandon budgeting apps shortly after onboarding.",
    observation:
      "Participants initially hire budgeting apps to reduce stress, but they abandon them when trust breaks or maintenance starts to feel like extra emotional labor.",
    participantFields: buildBudgetingParticipantFields(),
    plan: {
      estimatedDurationMinutes: 20,
      exampleProbes: [
        "What happened right after the first setup flow ended?",
        "When did the app stop feeling helpful and start feeling heavy?",
        "What made that screen feel trustworthy or untrustworthy?",
        "What did you do instead once the app lost momentum?",
        "What would have made you give it one more chance?",
      ],
      hypotheses: [
        "Onboarding promises relief faster than the product can actually deliver it.",
        "Trust drops sharply when bank linking or categorization feels opaque.",
        "Emotional discomfort is a stronger churn driver than missing functionality.",
        "Users tolerate setup effort more than ongoing correction and upkeep.",
      ],
      mustCoverAreas: [
        "Identify the exact moment the product stopped feeling calming.",
        "Capture whether account-linking trust changed early product perception.",
        "Understand how category mistakes affected confidence in the totals.",
        "Separate emotional avoidance from practical feature friction.",
        "Identify what kind of reset could make the app feel worth reopening.",
      ],
      objective:
        "Understand the emotional and practical reasons Gen Z users abandon budgeting apps shortly after onboarding.",
      openingQuestion:
        "Tell me about the moment you first decided to try a budgeting app?",
      probingStrategy: [
        "Ask for concrete moments rather than general opinions.",
        "Follow emotional language before switching back to mechanics.",
        "Probe what changed between week one and the point of abandonment.",
        "Challenge any mismatch between stated goals and actual behavior.",
      ],
      selectedBehaviorId: "challenge-contradictions",
      selectedTone: "calm and probing",
      thingsToAvoid: [
        "Do not assume the participant wants stricter discipline.",
        "Do not frame churn as a personal failure.",
        "Do not over-focus on features before the emotional context is clear.",
        "Do not lead the participant toward generic trust complaints.",
      ],
      topics: [
        "Onboarding expectation gap",
        "Trust in account linking",
        "Category accuracy and transparency",
        "Emotional reaction to spending visibility",
        "Maintenance burden over time",
        "Re-engagement triggers",
      ],
    },
    sessions: [
      {
        completedHoursAgo: 36,
        debrief: {
          contradictions: [
            "She wants accountability from the app, but avoids opening it when she already feels behind.",
            "She asked for automation, yet lost trust the moment linking and categorization felt opaque.",
          ],
          emotionSignal: "high",
          evidence: [
            {
              followUp: "What would have needed to happen in that first screen for it to feel safe?",
              label: "Onboarding trust broke early",
              quote: "The setup looked easy, but the bank-link screen immediately made me nervous.",
              theme: "Trust in account linking",
              whyItMatters: "Early trust friction reframed the product from calming helper to risky request.",
            },
            {
              followUp: "What did the app do in those moments that felt especially sharp or judgmental?",
              label: "Negative emotion blocked return",
              quote: "On bad money days I avoided it completely.",
              theme: "Emotional reaction to spending visibility",
              whyItMatters: "Avoidance shows the product amplified shame instead of lowering cognitive load.",
            },
            {
              followUp: "What kind of reset would feel realistic enough to try in the moment?",
              label: "Return requires a lighter restart",
              quote: "If it gave me a simple reset instead of a pile of red warnings, I'd probably try again",
              theme: "Re-engagement triggers",
              whyItMatters: "Recovery mechanics matter as much as initial onboarding for this segment.",
            },
          ],
          interviewQuality: {
            coverage: "Covered 5 of 6 topics with direct lived examples.",
            depth: "High depth on emotion and trust, lighter depth on return conditions.",
            participantEngagement: "High and reflective once the emotional language surfaced.",
          },
          keyTakeaway:
            "Maya adopted the app for emotional relief, but the product quickly became another source of financial shame and correction work.",
          missedAreas: ["Specific re-engagement moments after a good paycheck cycle."],
          recommendedFollowUp: [
            "Test whether a judgment-free monthly reset changes willingness to return.",
            "Explore how much trust could be rebuilt with manual-first onboarding.",
            "Compare reactions to corrective tasks versus passive summaries.",
          ],
          reasoning: [
            {
              aiDecision: "Stayed with the calming-versus-lecturing framing before moving into features.",
              pairIndex: 0,
              researchPurpose: "Clarify the product job the participant hired the app to do.",
              source: "participant",
              status: "completed",
              trigger: "Participant described the app as an emotional aid, not just a tool.",
            },
            {
              aiDecision: "Probed the bank-linking moment instead of skipping ahead to churn.",
              pairIndex: 1,
              researchPurpose: "Identify the earliest trust break in the journey.",
              source: "assistant",
              status: "completed",
              trigger: "A sharp trust reaction appeared during onboarding.",
            },
            {
              aiDecision: "Saved re-engagement detail as a lighter follow-up area rather than forcing certainty.",
              pairIndex: 4,
              researchPurpose: "Preserve signal quality while acknowledging thin evidence on return triggers.",
              source: "participant",
              status: "planned",
              trigger: "Return conditions were directional but not fully specific.",
            },
          ],
          topicCoverage: [
            { topic: "Onboarding expectation gap", status: "covered", evidenceStrength: "high", score: 4 },
            { topic: "Trust in account linking", status: "covered", evidenceStrength: "high", score: 4 },
            {
              topic: "Category accuracy and transparency",
              status: "in-progress",
              evidenceStrength: "medium",
              score: 3,
            },
            {
              topic: "Emotional reaction to spending visibility",
              status: "covered",
              evidenceStrength: "high",
              score: 5,
            },
            { topic: "Maintenance burden over time", status: "covered", evidenceStrength: "high", score: 4 },
            { topic: "Re-engagement triggers", status: "weak-evidence", evidenceStrength: "low", score: 1 },
          ],
          topThemes: [
            { label: "Shame avoidance", score: 4, strength: "high" },
            { label: "Automation trust gap", score: 3, strength: "medium" },
            { label: "Low-friction reset moments", score: 2, strength: "low" },
          ],
          whyThisMatters:
            "This participant shows that churn can come from emotional self-protection even when the product technically solves the intended problem.",
        },
        id: "demo-budgeting-p01",
        participantNumber: 1,
        participantResponses: {
          ageRange: "18-24",
          budgetingConfidence: "low",
          country: "US",
          currentMoneyTool: "manual",
          lastBudgetingApp: "Rocket Money",
          preferredName: "Maya",
        },
        turns: [
          {
            assistant: "Tell me about the moment you first decided to try a budgeting app.",
            participant:
              "I downloaded Rocket Money after a week where I swiped my card all the time and felt gross about it. I wanted the app to calm me down, not lecture me.",
          },
          {
            assistant: "How did the onboarding and account-linking part feel once you got in?",
            participant:
              "The setup looked easy, but the bank-link screen immediately made me nervous. It asked for a lot before it showed me anything useful.",
          },
          {
            assistant: "What happened after the first few days of actually using it?",
            participant:
              "The categories were messy, and every correction felt like homework. If lunch showed up as shopping again, I stopped trusting the totals.",
          },
          {
            assistant: "What was it like emotionally to open the app later on?",
            participant:
              "On bad money days I avoided it completely. I said I wanted accountability, but when I already felt behind I didn't want another reminder.",
          },
          {
            assistant: "What would have made you give it another shot?",
            participant:
              "If it gave me a simple reset instead of a pile of red warnings, I'd probably try again at the start of a new month.",
          },
        ],
      },
      {
        completedHoursAgo: 28,
        debrief: {
          contradictions: [
            "He wants a real-time money view, but rejects the account-linking step that would create it.",
          ],
          emotionSignal: "medium",
          evidence: [
            {
              followUp: "What kind of limited-data trial would have felt safe enough to continue?",
              label: "Trust barrier blocks setup",
              quote: "I never fully linked my accounts because variable paychecks make me protective of that information.",
              theme: "Trust in account linking",
              whyItMatters: "Trust and privacy concern prevented the participant from reaching the product's core value quickly.",
            },
            {
              followUp: "How many wrong categories would it take before the product stopped feeling worth correcting?",
              label: "Accuracy problems create babysitting work",
              quote: "when the app guessed categories wrong I had to babysit it.",
              theme: "Category accuracy and transparency",
              whyItMatters: "Perceived intelligence breaks down when the app creates cleanup work before showing reliable value.",
            },
            {
              followUp: "What made Notes feel lighter even though it is less automated?",
              label: "Manual workaround feels lower effort",
              quote: "I track rough numbers in Notes now because it feels lighter.",
              theme: "Maintenance burden over time",
              whyItMatters: "A simpler manual workflow beat the richer product because ongoing upkeep felt lower.",
            },
          ],
          interviewQuality: {
            coverage: "Covered 4 of 6 topics strongly, with two lighter areas.",
            depth: "Good depth on trust and maintenance tradeoffs.",
            participantEngagement: "Medium; concise answers with clear practical tradeoffs.",
          },
          keyTakeaway:
            "Jordan churned before full adoption because the product demanded trust and correction work before earning either.",
          missedAreas: [
            "Specific emotional reactions after incorrect categorization.",
            "Concrete conditions that would trigger a later return.",
          ],
          recommendedFollowUp: [
            "Test a manual-first or read-only trial mode before bank linking.",
            "Probe how much error tolerance exists before category drift kills trust.",
          ],
          reasoning: [
            {
              aiDecision: "Stayed on the partial-linking decision before exploring alternatives.",
              pairIndex: 0,
              researchPurpose: "Separate trust friction from general disinterest.",
              source: "participant",
              status: "completed",
              trigger: "The participant described wanting the value without taking the trust leap.",
            },
            {
              aiDecision: "Shifted into category accuracy because that was the next explicit trust breaker.",
              pairIndex: 2,
              researchPurpose: "Map how trust deteriorated after partial onboarding.",
              source: "assistant",
              status: "completed",
              trigger: "The participant described the totals as something he no longer trusted.",
            },
            {
              aiDecision: "Left return triggers as an open follow-up rather than inferring more certainty.",
              pairIndex: 4,
              researchPurpose: "Keep the debrief grounded where evidence is thin.",
              source: "participant",
              status: "planned",
              trigger: "The participant offered a directional answer, not a concrete return behavior.",
            },
          ],
          topicCoverage: [
            { topic: "Onboarding expectation gap", status: "covered", evidenceStrength: "high", score: 4 },
            { topic: "Trust in account linking", status: "covered", evidenceStrength: "high", score: 5 },
            {
              topic: "Category accuracy and transparency",
              status: "weak-evidence",
              evidenceStrength: "low",
              score: 1,
            },
            {
              topic: "Emotional reaction to spending visibility",
              status: "in-progress",
              evidenceStrength: "medium",
              score: 2,
            },
            { topic: "Maintenance burden over time", status: "covered", evidenceStrength: "high", score: 4 },
            { topic: "Re-engagement triggers", status: "not-explored", evidenceStrength: "none", score: 0 },
          ],
          topThemes: [
            { label: "Automation trust gap", score: 4, strength: "high" },
            { label: "Budget upkeep fatigue", score: 3, strength: "medium" },
            { label: "Category mismatch", score: 2, strength: "low" },
          ],
          whyThisMatters:
            "This interview shows a product can lose on trust and perceived effort even when the underlying need remains active.",
        },
        id: "demo-budgeting-p02",
        participantNumber: 2,
        participantResponses: {
          ageRange: "18-24",
          budgetingConfidence: "medium",
          country: "US",
          currentMoneyTool: "manual",
          lastBudgetingApp: "PocketGuard",
          preferredName: "Jordan",
        },
        turns: [
          {
            assistant: "What made you try a budgeting app in the first place?",
            participant:
              "I wanted a live view because my paychecks bounce around, and I was tired of guessing where weekend money went.",
          },
          {
            assistant: "How did setup go once the app asked for account access?",
            participant:
              "I never fully linked my accounts because variable paychecks make me protective of that information. I still wanted a live view, just not enough to hand everything over.",
          },
          {
            assistant: "What happened when you started using the parts you were comfortable with?",
            participant:
              "I liked seeing where weekend money went, but when the app guessed categories wrong I had to babysit it.",
          },
          {
            assistant: "What did you do instead after that?",
            participant:
              "I track rough numbers in Notes now because it feels lighter. If I open an app and it needs fixing before it helps, I'm out.",
          },
          {
            assistant: "What would have made the app feel worth continuing with?",
            participant:
              "A trial mode with manual entry first would have made me trust it more.",
          },
        ],
      },
      {
        completedHoursAgo: 18,
        debrief: {
          contradictions: [
            "She likes planning and structure, but rejects recurring maintenance that keeps the plan alive.",
          ],
          emotionSignal: "low",
          evidence: [
            {
              followUp: "What did the polished setup promise that the later experience failed to maintain?",
              label: "Onboarding set the wrong expectation",
              quote: "The onboarding was polished, and at first that made me think the whole thing would stay effortless.",
              theme: "Onboarding expectation gap",
              whyItMatters: "A smooth first impression raised expectations the longer-term product could not sustain.",
            },
            {
              followUp: "Which recurring task crossed the line from helpful to burdensome first?",
              label: "Maintenance became unpaid admin",
              quote: "By week two it felt like I had a second assignment",
              theme: "Maintenance burden over time",
              whyItMatters: "Churn was driven by recurring maintenance load, not by a lack of motivation to plan.",
            },
            {
              followUp: "What kind of one-action summary would feel realistic enough to reopen?",
              label: "Return depends on lighter summaries",
              quote: "If it quietly summarized what changed and gave me one tiny action, I'd reopen it.",
              theme: "Re-engagement triggers",
              whyItMatters: "The participant wants guided re-entry rather than another full-budget ritual.",
            },
          ],
          interviewQuality: {
            coverage: "Covered 5 of 6 topics with strong narrative clarity.",
            depth: "High depth on expectation mismatch and recurring effort.",
            participantEngagement: "Thoughtful and specific with good timeline recall.",
          },
          keyTakeaway:
            "Alina did not reject budgeting itself; she rejected a product experience that turned planning into never-ending upkeep.",
          missedAreas: ["Detailed trust reaction to bank linking compared with other friction."],
          recommendedFollowUp: [
            "Test summary-first re-entry patterns instead of asking users to re-open full budgeting workflows.",
            "Compare willingness to maintain categories versus willingness to review a passive digest.",
          ],
          reasoning: [
            {
              aiDecision: "Stayed on the expectation set by onboarding before exploring churn.",
              pairIndex: 1,
              researchPurpose: "Understand how the first impression shaped tolerance for later friction.",
              source: "participant",
              status: "completed",
              trigger: "The participant clearly contrasted polished onboarding with later effort.",
            },
            {
              aiDecision: "Asked for concrete examples of upkeep rather than accepting 'too much work' at face value.",
              pairIndex: 2,
              researchPurpose: "Translate general fatigue into productable friction points.",
              source: "assistant",
              status: "completed",
              trigger: "Maintenance burden surfaced as the core drop-off mechanism.",
            },
            {
              aiDecision: "Captured reopening conditions as an actionable design opportunity.",
              pairIndex: 4,
              researchPurpose: "Preserve signal around re-entry design rather than only churn causes.",
              source: "participant",
              status: "completed",
              trigger: "The participant proposed a specific, lighter-weight return pattern.",
            },
          ],
          topicCoverage: [
            { topic: "Onboarding expectation gap", status: "covered", evidenceStrength: "high", score: 4 },
            {
              topic: "Trust in account linking",
              status: "in-progress",
              evidenceStrength: "medium",
              score: 2,
            },
            {
              topic: "Category accuracy and transparency",
              status: "covered",
              evidenceStrength: "high",
              score: 4,
            },
            {
              topic: "Emotional reaction to spending visibility",
              status: "covered",
              evidenceStrength: "high",
              score: 4,
            },
            { topic: "Maintenance burden over time", status: "covered", evidenceStrength: "high", score: 5 },
            { topic: "Re-engagement triggers", status: "in-progress", evidenceStrength: "medium", score: 3 },
          ],
          topThemes: [
            { label: "Budget upkeep fatigue", score: 4, strength: "high" },
            { label: "Onboarding expectation gap", score: 3, strength: "medium" },
            { label: "Low-friction reset moments", score: 2, strength: "low" },
          ],
          whyThisMatters:
            "The study should distinguish between users who dislike budgeting and users who dislike the recurring labor the product creates.",
        },
        id: "demo-budgeting-p03",
        participantNumber: 3,
        participantResponses: {
          ageRange: "18-24",
          budgetingConfidence: "medium",
          country: "US",
          currentMoneyTool: "budgeting-app",
          lastBudgetingApp: "YNAB",
          preferredName: "Alina",
        },
        turns: [
          {
            assistant: "What was happening in your life when you decided to try a budgeting app?",
            participant:
              "I tried YNAB right after graduation because I wanted to feel organized once rent kicked in.",
          },
          {
            assistant: "How did the first-run experience set your expectations?",
            participant:
              "The onboarding was polished, and at first that made me think the whole thing would stay effortless.",
          },
          {
            assistant: "What changed once you were a couple of weeks in?",
            participant:
              "By week two it felt like I had a second assignment: rename categories, move money, explain every weird charge.",
          },
          {
            assistant: "How did that affect your relationship with the app over time?",
            participant:
              "I like planning, but I hate maintenance that never ends. That made me stop opening it unless I absolutely had to.",
          },
          {
            assistant: "What would make the product feel worth reopening again?",
            participant:
              "If it quietly summarized what changed and gave me one tiny action, I'd reopen it.",
          },
        ],
      },
    ],
    status: "completed",
    title: "Why do Gen Z users abandon budgeting apps after onboarding?",
  },
  {
    allThemes: [
      "Feedback avoidance disguised as thoughtfulness",
      "Status meetings crowd out coaching",
      "Permanent-record anxiety",
      "Feedback prep has too much ceremony",
    ],
    audience: "US-based first-time people managers with 3-10 direct reports",
    context: "Weekly 1:1s, performance coaching, and lightweight management workflows",
    createdDaysAgo: 4,
    id: "demo-manager-feedback-avoidance",
    interviewsTarget: 4,
    objective:
      "Understand why first-time managers delay regular feedback even when they believe it matters.",
    observation:
      "Managers do not lack conviction about feedback; they delay it because prep feels heavy, written records feel risky, and 1:1s default to safer status updates.",
    participantFields: buildManagerParticipantFields(),
    plan: {
      estimatedDurationMinutes: 25,
      exampleProbes: [
        "What tells you that feedback is needed before you say anything out loud?",
        "What usually happens between noticing the issue and the next 1:1?",
        "What part of giving the feedback feels hardest in the moment?",
        "Where do your notes or follow-up commitments usually break down?",
        "What would make a difficult feedback conversation easier to start?",
      ],
      hypotheses: [
        "New managers delay feedback because emotional risk rises faster than procedural clarity.",
        "1:1 structures default to status because coaching requires more prep and confidence.",
        "Documentation feels risky when managers are still deciding what they really think.",
        "Managers want lightweight support tools, not formal HR-style systems, for early coaching prep.",
      ],
      mustCoverAreas: [
        "Identify the first internal signal that tells a manager feedback is needed.",
        "Understand how prep and note-taking shape whether the conversation happens.",
        "Separate fear of conflict from fear of creating a permanent written record.",
        "Capture why 1:1s drift into updates instead of coaching.",
        "Find the smallest intervention that could make timely feedback more likely.",
      ],
      objective:
        "Understand why first-time managers delay regular feedback even when they believe it matters.",
      openingQuestion:
        "Think about a recent moment when you knew feedback was needed but did not give it right away; what happened?",
      probingStrategy: [
        "Anchor on a recent example before discussing broader habits.",
        "Distinguish emotional discomfort from workflow friction.",
        "Probe the gap between noticing a problem and acting on it.",
        "Look for contradiction between stated coaching values and actual meeting behavior.",
      ],
      selectedBehaviorId: "challenge-contradictions",
      selectedTone: "direct and neutral",
      thingsToAvoid: [
        "Do not frame delay as laziness or lack of care.",
        "Do not jump straight to performance-management policy.",
        "Do not treat all documentation as equally formal or risky.",
        "Do not assume missed feedback means the manager lacks empathy.",
      ],
      topics: [
        "First signs feedback is needed",
        "Preparation before 1:1s",
        "Delivering difficult feedback",
        "Status updates vs coaching",
        "Documentation and follow-through",
        "HR/privacy concerns around records",
      ],
    },
    sessions: [
      {
        completedHoursAgo: 30,
        debrief: {
          contradictions: [
            "Eric says feedback should be fast, but waits for perfect wording until the moment passes.",
            "He wants lighter manager tooling, yet avoids writing even private notes when the signal is still forming.",
          ],
          emotionSignal: "high",
          evidence: [
            {
              followUp: "What would make a rough private note feel safe enough to capture in the moment?",
              label: "Permanent-record anxiety",
              quote: "I rarely write them down because I don't want a permanent record of a half-formed concern.",
              theme: "HR/privacy concerns around records",
              whyItMatters: "The manager avoids documentation before the conversation even starts, which weakens preparation and follow-through.",
            },
            {
              followUp: "What makes the wording feel 'perfect enough' to act?",
              label: "Perfectionism delays action",
              quote: "If the feedback is tough, I wait for the perfect wording and then the week disappears.",
              theme: "Delivering difficult feedback",
              whyItMatters: "Delay is not lack of awareness; it is an emotional gating mechanism tied to identity and risk.",
            },
            {
              followUp: "What would let a 1:1 shift from status update into coaching without feeling abrupt?",
              label: "Safer topics crowd out coaching",
              quote: "Our 1:1s turn into shipping updates because that feels safer",
              theme: "Status updates vs coaching",
              whyItMatters: "Meeting structure favors lower-risk status talk, starving the exact coaching moments the manager says matter.",
            },
          ],
          interviewQuality: {
            coverage: "Covered 5 of 6 topics with strong specifics.",
            depth: "High depth on hesitation, note-taking, and conversation avoidance.",
            participantEngagement: "High; candid and self-aware.",
          },
          keyTakeaway:
            "Eric delays feedback not because he misses the signal, but because acting on it requires emotional certainty and a note-taking pattern he does not trust yet.",
          missedAreas: ["Concrete follow-through behavior after the conversation finally happens."],
          recommendedFollowUp: [
            "Test whether private, non-shareable prep notes reduce the threshold to capture feedback early.",
            "Explore prompts that help managers move from status updates into coaching without a full script.",
          ],
          reasoning: [
            {
              aiDecision: "Stayed on the first internal cue before exploring process fixes.",
              pairIndex: 0,
              researchPurpose: "Separate awareness from action delay.",
              source: "participant",
              status: "completed",
              trigger: "The participant immediately described a recognizable signal that feedback was needed.",
            },
            {
              aiDecision: "Asked about writing and permanence once half-formed concerns came up.",
              pairIndex: 1,
              researchPurpose: "Understand whether documentation fear is a root blocker or a side effect.",
              source: "assistant",
              status: "completed",
              trigger: "The participant named written records as risky before naming any tool gap.",
            },
            {
              aiDecision: "Captured the safer-status-meeting pattern as a contradiction rather than a separate complaint.",
              pairIndex: 3,
              researchPurpose: "Tie meeting behavior back to the core coaching gap.",
              source: "participant",
              status: "completed",
              trigger: "The participant explicitly contrasted safer updates with avoided coaching.",
            },
          ],
          topicCoverage: [
            { topic: "First signs feedback is needed", status: "covered", evidenceStrength: "high", score: 4 },
            { topic: "Preparation before 1:1s", status: "covered", evidenceStrength: "high", score: 4 },
            { topic: "Delivering difficult feedback", status: "covered", evidenceStrength: "high", score: 5 },
            {
              topic: "Status updates vs coaching",
              status: "in-progress",
              evidenceStrength: "medium",
              score: 3,
            },
            {
              topic: "Documentation and follow-through",
              status: "weak-evidence",
              evidenceStrength: "low",
              score: 1,
            },
            {
              topic: "HR/privacy concerns around records",
              status: "covered",
              evidenceStrength: "high",
              score: 4,
            },
          ],
          topThemes: [
            { label: "Permanent-record anxiety", score: 4, strength: "high" },
            { label: "Feedback avoidance disguised as thoughtfulness", score: 3, strength: "medium" },
            { label: "Status meetings crowd out coaching", score: 2, strength: "low" },
          ],
          whyThisMatters:
            "This is a high-value signal for product design: managers may need psychological safety in their prep layer before they can be more consistent in the conversation layer.",
        },
        id: "demo-manager-p01",
        participantNumber: 1,
        participantResponses: {
          ageRange: "25-34",
          country: "US",
          feedbackConfidence: "medium",
          managerTenure: "under-1-year",
          preferredName: "Eric",
          roleTitle: "Engineering Manager",
          teamSize: "4-6",
        },
        turns: [
          {
            assistant: "Think about a recent moment when you knew feedback was needed but did not give it right away; what happened?",
            participant:
              "I usually know feedback is needed when I start rewriting a Slack message three times instead of just sending it.",
          },
          {
            assistant: "What do you typically do between that moment and the next 1:1?",
            participant:
              "Before a 1:1 I collect examples in my head, but I rarely write them down because I don't want a permanent record of a half-formed concern.",
          },
          {
            assistant: "What makes the actual feedback conversation hard to start?",
            participant:
              "If the feedback is tough, I wait for the perfect wording and then the week disappears.",
          },
          {
            assistant: "How do your 1:1s usually go when that happens?",
            participant:
              "Our 1:1s turn into shipping updates because that feels safer than saying, 'this is starting to be a pattern.'",
          },
          {
            assistant: "What would make it easier to move sooner?",
            participant:
              "A lightweight private prep tool would help, something between sticky notes and an HR document.",
          },
        ],
      },
      {
        completedHoursAgo: 22,
        debrief: {
          contradictions: [
            "Nina notices performance patterns quickly, but operational firefighting repeatedly displaces the coaching she says is important.",
          ],
          emotionSignal: "medium",
          evidence: [
            {
              followUp: "What has to be true for the 1:1 to avoid being swallowed by active fires?",
              label: "Coaching loses to urgent work",
              quote: "by the time the 1:1 happens we've spent twenty minutes on fires and account escalations.",
              theme: "Status updates vs coaching",
              whyItMatters: "Urgency creates a reliable meeting pattern that squeezes out feedback before it starts.",
            },
            {
              followUp: "Which system would you trust enough to keep the coaching thread alive?",
              label: "Follow-up fragments across tools",
              quote: "they live in three different places so the coaching thread gets diluted.",
              theme: "Documentation and follow-through",
              whyItMatters: "The issue is not remembering that feedback matters, but losing continuity between sessions.",
            },
            {
              followUp: "What would a calmer-week fallback look like when the calm week never arrives?",
              label: "Delay waits for ideal conditions",
              quote: "I keep saving the heavier conversations for a calmer week that never arrives.",
              theme: "Delivering difficult feedback",
              whyItMatters: "The participant relies on a future-state condition that rarely materializes, creating predictable delay.",
            },
          ],
          interviewQuality: {
            coverage: "Covered 5 of 6 topics with strong process detail.",
            depth: "Strong depth on operational drag and follow-through gaps.",
            participantEngagement: "Medium-high; clear and concrete with less emotional language.",
          },
          keyTakeaway:
            "Nina's main blocker is not noticing feedback needs, but protecting coaching time and continuity in a management environment dominated by urgent work.",
          missedAreas: ["Detailed concern about formal records or HR visibility."],
          recommendedFollowUp: [
            "Test a dedicated pre-1:1 workflow that protects a coaching agenda before operational updates take over.",
            "Explore whether follow-through improves when notes and next steps live in one lightweight place.",
          ],
          reasoning: [
            {
              aiDecision: "Stayed on meeting takeover dynamics instead of broadening too quickly.",
              pairIndex: 1,
              researchPurpose: "Identify the system-level pattern displacing feedback.",
              source: "participant",
              status: "completed",
              trigger: "The participant described a recurring and concrete meeting failure mode.",
            },
            {
              aiDecision: "Probed where follow-up lived because continuity sounded like the hidden blocker.",
              pairIndex: 2,
              researchPurpose: "Understand whether the delay was about courage, memory, or workflow fragmentation.",
              source: "assistant",
              status: "completed",
              trigger: "The participant shifted from urgency to note fragmentation.",
            },
            {
              aiDecision: "Marked HR-record concern as a gap instead of filling it in from similar interviews.",
              pairIndex: 4,
              researchPurpose: "Keep the debrief grounded in this participant's own evidence.",
              source: "participant",
              status: "planned",
              trigger: "The participant named scheduling and workflow issues more strongly than formal-record fear.",
            },
          ],
          topicCoverage: [
            { topic: "First signs feedback is needed", status: "covered", evidenceStrength: "high", score: 4 },
            {
              topic: "Preparation before 1:1s",
              status: "in-progress",
              evidenceStrength: "medium",
              score: 3,
            },
            {
              topic: "Delivering difficult feedback",
              status: "in-progress",
              evidenceStrength: "medium",
              score: 3,
            },
            {
              topic: "Status updates vs coaching",
              status: "covered",
              evidenceStrength: "high",
              score: 4,
            },
            {
              topic: "Documentation and follow-through",
              status: "in-progress",
              evidenceStrength: "medium",
              score: 3,
            },
            {
              topic: "HR/privacy concerns around records",
              status: "not-explored",
              evidenceStrength: "none",
              score: 0,
            },
          ],
          topThemes: [
            { label: "Status meetings crowd out coaching", score: 4, strength: "high" },
            { label: "Feedback prep has too much ceremony", score: 3, strength: "medium" },
            { label: "Documentation and follow-through drift", score: 2, strength: "low" },
          ],
          whyThisMatters:
            "If the product cannot protect coaching time and continuity, it will not materially change manager behavior even if it improves note quality.",
        },
        id: "demo-manager-p02",
        participantNumber: 2,
        participantResponses: {
          ageRange: "25-34",
          country: "US",
          feedbackConfidence: "medium",
          managerTenure: "1-2-years",
          preferredName: "Nina",
          roleTitle: "Customer Success Lead",
          teamSize: "7-10",
        },
        turns: [
          {
            assistant: "How do you first notice that feedback probably needs to happen?",
            participant:
              "I can tell feedback is needed pretty quickly, usually after the second time I see the same issue.",
          },
          {
            assistant: "What gets in the way between noticing it and the conversation?",
            participant:
              "The problem is I manage eight people, so by the time the 1:1 happens we've spent twenty minutes on fires and account escalations.",
          },
          {
            assistant: "What happens to your prep or follow-up when that occurs?",
            participant:
              "I leave myself follow-up tasks, but they live in three different places so the coaching thread gets diluted.",
          },
          {
            assistant: "How does that affect the harder feedback conversations?",
            participant:
              "I want feedback to be regular, but I keep saving the heavier conversations for a calmer week that never arrives.",
          },
          {
            assistant: "What would make the behavior easier to sustain?",
            participant:
              "If I had a short pre-1:1 template that pulled the thread forward, I'd probably use it every time.",
          },
        ],
      },
      {
        completedHoursAgo: 14,
        debrief: {
          contradictions: [
            "Sam is comfortable being direct live, but still avoids writing the candid note that would make follow-through clearer.",
          ],
          emotionSignal: "medium",
          evidence: [
            {
              followUp: "What kind of note would feel helpful without feeling like a case file?",
              label: "Formal notes feel too loaded",
              quote: "Once it's in a doc it feels more official and more loaded.",
              theme: "HR/privacy concerns around records",
              whyItMatters: "The manager's resistance is about the perceived weight of written artifacts, not about the feedback itself.",
            },
            {
              followUp: "What makes tone so much harder before the meeting than during it?",
              label: "Pre-meeting prep creates drag",
              quote: "before the meeting I overthink tone and context.",
              theme: "Preparation before 1:1s",
              whyItMatters: "Preparation overhead is front-loaded, which raises the threshold to start a timely conversation.",
            },
            {
              followUp: "What would a crisp next-step capture look like immediately after the 1:1?",
              label: "Follow-through lacks a lightweight record",
              quote: "I still leave without a crisp note about what we agreed to change.",
              theme: "Documentation and follow-through",
              whyItMatters: "Even when the conversation happens, the manager loses compounding value by not capturing a usable next step.",
            },
          ],
          interviewQuality: {
            coverage: "Covered all major topics except fully resolved follow-through practices.",
            depth: "Strong depth on writing aversion and tone management.",
            participantEngagement: "Medium-high with thoughtful examples.",
          },
          keyTakeaway:
            "Sam does not resist coaching conversations themselves; the main friction is the perceived permanence and emotional load of putting candid feedback into writing.",
          missedAreas: ["Specific examples of when follow-through notes improved later outcomes."],
          recommendedFollowUp: [
            "Test a private post-1:1 capture flow focused on intent and next step rather than evaluative language.",
            "Explore whether tone-support prompts reduce pre-meeting hesitation without over-formalizing the process.",
          ],
          reasoning: [
            {
              aiDecision: "Followed the 'official and loaded' language rather than generalizing it as dislike of docs.",
              pairIndex: 1,
              researchPurpose: "Pin down why writing feels risky for this manager.",
              source: "participant",
              status: "completed",
              trigger: "The participant described a specific emotional reaction to written permanence.",
            },
            {
              aiDecision: "Asked about prep separately from live delivery to isolate where hesitation actually sits.",
              pairIndex: 2,
              researchPurpose: "Separate anticipation friction from in-the-room communication skill.",
              source: "assistant",
              status: "completed",
              trigger: "The participant said directness during the meeting was not the main issue.",
            },
            {
              aiDecision: "Logged follow-through as in-progress instead of covered because the current habit is still thin.",
              pairIndex: 3,
              researchPurpose: "Represent the gap accurately without overstating maturity.",
              source: "participant",
              status: "completed",
              trigger: "The participant admitted conversations happen, but usable capture often does not.",
            },
          ],
          topicCoverage: [
            { topic: "First signs feedback is needed", status: "covered", evidenceStrength: "high", score: 4 },
            { topic: "Preparation before 1:1s", status: "covered", evidenceStrength: "high", score: 4 },
            { topic: "Delivering difficult feedback", status: "covered", evidenceStrength: "high", score: 4 },
            {
              topic: "Status updates vs coaching",
              status: "covered",
              evidenceStrength: "high",
              score: 4,
            },
            {
              topic: "Documentation and follow-through",
              status: "in-progress",
              evidenceStrength: "medium",
              score: 3,
            },
            {
              topic: "HR/privacy concerns around records",
              status: "covered",
              evidenceStrength: "high",
              score: 4,
            },
          ],
          topThemes: [
            { label: "Permanent-record anxiety", score: 4, strength: "high" },
            { label: "Feedback prep has too much ceremony", score: 3, strength: "medium" },
            { label: "Documentation and follow-through drift", score: 2, strength: "low" },
          ],
          whyThisMatters:
            "A useful product here likely reduces the perceived stakes of writing and capturing feedback, rather than trying to teach managers how to care more.",
        },
        id: "demo-manager-p03",
        participantNumber: 3,
        participantResponses: {
          ageRange: "35-44",
          country: "US",
          feedbackConfidence: "medium",
          managerTenure: "1-2-years",
          preferredName: "Sam",
          roleTitle: "Design Lead",
          teamSize: "4-6",
        },
        turns: [
          {
            assistant: "When do you usually realize feedback is needed?",
            participant:
              "I care a lot about being a supportive manager, so I notice pretty fast when someone's work is drifting.",
          },
          {
            assistant: "What slows you down once you notice it?",
            participant:
              "What slows me down is writing it anywhere permanent. Once it's in a doc it feels more official and more loaded.",
          },
          {
            assistant: "What is the hard part before the meeting starts?",
            participant:
              "In the conversation I'm fine being direct, but before the meeting I overthink tone and context.",
          },
          {
            assistant: "How does that show up in your 1:1 rhythm and follow-through?",
            participant:
              "I do use 1:1s for coaching, but I still leave without a crisp note about what we agreed to change.",
          },
          {
            assistant: "What would make that easier without making it feel heavier?",
            participant:
              "I'd love a way to capture the intent and next step without sounding like I'm building a case.",
          },
        ],
      },
    ],
    status: "interviewing",
    title: "Why do first-time managers avoid giving regular feedback?",
  },
];

export const DEMO_STUDY_IDS = demoStudyDefinitions.map((study) => study.id);

export function buildDemoStudies(now = new Date()): BuiltDemoStudy[] {
  return demoStudyDefinitions.map((definition) => buildStudyArtifacts(definition, now));
}
