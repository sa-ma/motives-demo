import { Type, type Static } from "@sinclair/typebox";

export const StudyStatusSchema = Type.Union([
  Type.Literal("planning"),
  Type.Literal("interviewing"),
  Type.Literal("analyzing"),
  Type.Literal("completed"),
  Type.Literal("archived"),
]);

export type StudyStatus = Static<typeof StudyStatusSchema>;

export const StudySummaryAccentSchema = Type.Union([
  Type.Literal("interviewing"),
  Type.Literal("planning"),
  Type.Literal("analyzing"),
  Type.Literal("completed"),
  Type.Literal("archived"),
]);

export type StudySummaryAccent = Static<typeof StudySummaryAccentSchema>;

export const StudyMetricCardSchema = Type.Object({
  id: Type.String(),
  label: Type.String(),
  value: Type.String(),
  subtitle: Type.String(),
  progress: Type.Optional(Type.Number()),
  progressLabel: Type.Optional(Type.String()),
  trendLabel: Type.Optional(Type.String()),
  tone: Type.Union([
    Type.Literal("primary"),
    Type.Literal("success"),
    Type.Literal("warning"),
    Type.Literal("violet"),
  ]),
});

export type StudyMetricCard = Static<typeof StudyMetricCardSchema>;

export const StudyTopicCoverageStatusSchema = Type.Union([
  Type.Literal("covered"),
  Type.Literal("in-progress"),
  Type.Literal("weak-evidence"),
  Type.Literal("not-explored"),
  Type.Literal("pending-analysis"),
]);

export type StudyTopicCoverageStatus = Static<typeof StudyTopicCoverageStatusSchema>;

export const StudyTopicCoverageItemSchema = Type.Object({
  id: Type.String(),
  topic: Type.String(),
  status: StudyTopicCoverageStatusSchema,
  evidence: Type.Number(),
});

export type StudyTopicCoverageItem = Static<typeof StudyTopicCoverageItemSchema>;

export const StudyAnalysisStatusSchema = Type.Union([
  Type.Literal("not-started"),
  Type.Literal("pending"),
  Type.Literal("partial"),
  Type.Literal("ready"),
  Type.Literal("failed"),
]);

export type StudyAnalysisStatus = Static<typeof StudyAnalysisStatusSchema>;

export const StudyAnalysisSummarySchema = Type.Object({
  completedSessions: Type.Number(),
  failedDebriefs: Type.Number(),
  pendingDebriefs: Type.Number(),
  readyDebriefs: Type.Number(),
  status: StudyAnalysisStatusSchema,
});

export type StudyAnalysisSummary = Static<typeof StudyAnalysisSummarySchema>;

export const StudySessionItemSchema = Type.Object({
  id: Type.String(),
  participantLabel: Type.String(),
  participantInitials: Type.String(),
  state: Type.Union([Type.Literal("completed"), Type.Literal("in-progress")]),
  stateLabel: Type.String(),
  timingLabel: Type.String(),
  emotionalSignal: Type.Union([
    Type.Literal("high"),
    Type.Literal("medium"),
    Type.Literal("low"),
  ]),
  topicsCoveredLabel: Type.String(),
  topicsCoveredProgress: Type.Number(),
  contradictionsCount: Type.Number(),
  actionLabel: Type.String(),
  actionTone: Type.Union([Type.Literal("outline"), Type.Literal("primary")]),
  debriefStatus: Type.Union([
    Type.Literal("pending"),
    Type.Literal("ready"),
    Type.Literal("failed"),
    Type.Literal("unavailable"),
  ]),
  debriefError: Type.Optional(Type.String()),
});

export type StudySessionItem = Static<typeof StudySessionItemSchema>;

export const StudyActivityItemSchema = Type.Object({
  id: Type.String(),
  type: Type.Union([
    Type.Literal("session-complete"),
    Type.Literal("signal"),
    Type.Literal("contradiction"),
    Type.Literal("coverage"),
    Type.Literal("session-start"),
  ]),
  title: Type.String(),
  detail: Type.Optional(Type.String()),
  timestamp: Type.String(),
});

export type StudyActivityItem = Static<typeof StudyActivityItemSchema>;

export const StudySummarySchema = Type.Object({
  id: Type.String(),
  title: Type.String(),
  description: Type.String(),
  status: StudyStatusSchema,
  statusLabel: Type.String(),
  canStartInterview: Type.Boolean(),
  canArchiveStudy: Type.Boolean(),
  canEndStudy: Type.Boolean(),
  latestInviteUrl: Type.Optional(Type.String()),
  interviewsCompleted: Type.Number(),
  interviewsTarget: Type.Number(),
  coverage: Type.Number(),
  signalCount: Type.Number(),
  themeLabel: Type.String(),
  themes: Type.Array(Type.String()),
  hiddenThemesCount: Type.Optional(Type.Number()),
  observation: Type.String(),
  updatedLabel: Type.String(),
  actionLabel: Type.String(),
  accent: StudySummaryAccentSchema,
});

export type StudySummary = Static<typeof StudySummarySchema>;

export const StudyListStatusFilterSchema = Type.Union([
  Type.Literal("active"),
  Type.Literal("planning"),
  Type.Literal("interviewing"),
  Type.Literal("analyzing"),
  Type.Literal("completed"),
  Type.Literal("archived"),
]);

export type StudyListStatusFilter = Static<typeof StudyListStatusFilterSchema>;

export const StudyListSortSchema = Type.Union([
  Type.Literal("updated-desc"),
  Type.Literal("updated-asc"),
]);

export type StudyListSort = Static<typeof StudyListSortSchema>;

export const ListStudiesQuerySchema = Type.Object(
  {
    q: Type.Optional(Type.String({ maxLength: 120 })),
    sort: Type.Optional(StudyListSortSchema),
    status: Type.Optional(StudyListStatusFilterSchema),
  },
  { additionalProperties: false },
);

export type ListStudiesQuery = Static<typeof ListStudiesQuerySchema>;

export const StudyDetailSchema = Type.Object({
  studyId: Type.String(),
  title: Type.String(),
  description: Type.String(),
  status: StudyStatusSchema,
  statusLabel: Type.String(),
  hasApprovedPlan: Type.Boolean(),
  canStartInterview: Type.Boolean(),
  canApprovePlan: Type.Boolean(),
  canEditPlan: Type.Boolean(),
  canEndStudy: Type.Boolean(),
  canRegeneratePlan: Type.Boolean(),
  metadata: Type.Object({
    createdLabel: Type.String(),
    interviewDurationLabel: Type.String(),
    audienceLabel: Type.String(),
    interviewCountLabel: Type.String(),
  }),
  analysis: StudyAnalysisSummarySchema,
  metrics: Type.Array(StudyMetricCardSchema),
  insightThemes: Type.Array(Type.String()),
  aiObservation: Type.String(),
  topicCoverage: Type.Array(StudyTopicCoverageItemSchema),
  sessions: Type.Array(StudySessionItemSchema),
  recentActivity: Type.Array(StudyActivityItemSchema),
});

export type StudyDetail = Static<typeof StudyDetailSchema>;

export const SessionDebriefEvidenceItemSchema = Type.Object({
  id: Type.String(),
  quote: Type.String(),
  timestamp: Type.String(),
  theme: Type.String(),
  label: Type.String(),
  whyItMatters: Type.String(),
  followUp: Type.String(),
});

export type SessionDebriefEvidenceItem = Static<typeof SessionDebriefEvidenceItemSchema>;

export const SessionDebriefSummarySchema = Type.Object({
  keyTakeaway: Type.String(),
  topThemes: Type.Array(
    Type.Object({
      label: Type.String(),
      score: Type.Number(),
      strength: Type.Union([
        Type.Literal("high"),
        Type.Literal("medium"),
        Type.Literal("low"),
      ]),
    }),
  ),
  evidenceIds: Type.Array(Type.String()),
  recommendedFollowUp: Type.Array(Type.String()),
  whyThisMatters: Type.String(),
});

export type SessionDebriefSummary = Static<typeof SessionDebriefSummarySchema>;

export const SessionDebriefTranscriptRowSchema = Type.Object({
  id: Type.String(),
  timestamp: Type.String(),
  speaker: Type.Union([Type.Literal("ai"), Type.Literal("participant")]),
  speakerLabel: Type.String(),
  text: Type.String(),
  evidenceId: Type.Optional(Type.String()),
});

export type SessionDebriefTranscriptRow = Static<typeof SessionDebriefTranscriptRowSchema>;

export const SessionDebriefCoverageSchema = Type.Object({
  researchObjective: Type.String(),
  topics: Type.Array(
    Type.Object({
      id: Type.String(),
      topic: Type.String(),
      status: StudyTopicCoverageItemSchema.properties.status,
      evidenceStrength: Type.Union([
        Type.Literal("high"),
        Type.Literal("medium"),
        Type.Literal("low"),
        Type.Literal("none"),
      ]),
      score: Type.Number(),
    }),
  ),
  missedAreas: Type.Array(Type.String()),
  interviewQuality: Type.Object({
    coverage: Type.String(),
    depth: Type.String(),
    participantEngagement: Type.String(),
  }),
});

export type SessionDebriefCoverage = Static<typeof SessionDebriefCoverageSchema>;

export const SessionDebriefReasoningRowSchema = Type.Object({
  id: Type.String(),
  timestamp: Type.String(),
  trigger: Type.String(),
  aiDecision: Type.String(),
  researchPurpose: Type.String(),
  status: Type.Union([
    Type.Literal("completed"),
    Type.Literal("in-progress"),
    Type.Literal("planned"),
  ]),
});

export type SessionDebriefReasoningRow = Static<typeof SessionDebriefReasoningRowSchema>;

export const SessionDebriefSchema = Type.Object({
  studyId: Type.String(),
  sessionId: Type.String(),
  participantLabel: Type.String(),
  title: Type.String(),
  subtitle: Type.String(),
  summary: SessionDebriefSummarySchema,
  evidence: Type.Array(SessionDebriefEvidenceItemSchema),
  transcript: Type.Array(SessionDebriefTranscriptRowSchema),
  coverage: SessionDebriefCoverageSchema,
  reasoning: Type.Array(SessionDebriefReasoningRowSchema),
});

export type SessionDebrief = Static<typeof SessionDebriefSchema>;

export const SessionDebriefResponseSchema = Type.Union([
  Type.Object({
    status: Type.Literal("pending"),
    studyId: Type.String(),
    sessionId: Type.String(),
  }),
  Type.Object({
    status: Type.Literal("failed"),
    studyId: Type.String(),
    sessionId: Type.String(),
    error: Type.String(),
  }),
  Type.Object({
    status: Type.Literal("ready"),
    debrief: SessionDebriefSchema,
  }),
]);

export type SessionDebriefResponse = Static<typeof SessionDebriefResponseSchema>;

export const CreateStudyInputSchema = Type.Object(
  {
    title: Type.String({ minLength: 1, maxLength: 120 }),
    objective: Type.String({ minLength: 1, maxLength: 600 }),
    audience: Type.String({ minLength: 1, maxLength: 200 }),
    context: Type.String({ minLength: 1, maxLength: 200 }),
    topics: Type.Array(Type.String({ minLength: 1, maxLength: 100 }), {
      minItems: 1,
      maxItems: 12,
    }),
    targetParticipants: Type.Number({ minimum: 1, maximum: 50 }),
  },
  { additionalProperties: false },
);

export type CreateStudyInput = Static<typeof CreateStudyInputSchema>;

export const CreateStudyResponseSchema = Type.Object({
  studyId: Type.String(),
  study: StudySummarySchema,
});

export type CreateStudyResponse = Static<typeof CreateStudyResponseSchema>;

export const EndStudyResponseSchema = Type.Object({
  ok: Type.Literal(true),
  status: Type.Literal("completed"),
  studyId: Type.String(),
});

export type EndStudyResponse = Static<typeof EndStudyResponseSchema>;

export const ArchiveStudyResponseSchema = Type.Object({
  ok: Type.Literal(true),
  status: Type.Literal("archived"),
  studyId: Type.String(),
});

export type ArchiveStudyResponse = Static<typeof ArchiveStudyResponseSchema>;
