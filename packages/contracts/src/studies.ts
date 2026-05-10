import { Type, type Static } from "@sinclair/typebox";

export const StudyStatusSchema = Type.Union([
  Type.Literal("planning"),
  Type.Literal("interviewing"),
  Type.Literal("analyzing"),
  Type.Literal("completed"),
]);

export type StudyStatus = Static<typeof StudyStatusSchema>;

export const StudySummaryAccentSchema = Type.Union([
  Type.Literal("interviewing"),
  Type.Literal("planning"),
  Type.Literal("analyzing"),
  Type.Literal("completed"),
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

export const StudyTopicCoverageItemSchema = Type.Object({
  id: Type.String(),
  topic: Type.String(),
  status: Type.Union([
    Type.Literal("covered"),
    Type.Literal("in-progress"),
    Type.Literal("weak-evidence"),
    Type.Literal("not-explored"),
  ]),
  evidence: Type.Number(),
});

export type StudyTopicCoverageItem = Static<typeof StudyTopicCoverageItemSchema>;

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
  debriefAvailable: Type.Optional(Type.Boolean()),
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
  statusLabel: Type.String(),
  canStartInterview: Type.Boolean(),
  metadata: Type.Object({
    createdLabel: Type.String(),
    interviewDurationLabel: Type.String(),
    audienceLabel: Type.String(),
    interviewCountLabel: Type.String(),
  }),
  metrics: Type.Array(StudyMetricCardSchema),
  insightThemes: Type.Array(Type.String()),
  aiObservation: Type.String(),
  topicCoverage: Type.Array(StudyTopicCoverageItemSchema),
  sessions: Type.Array(StudySessionItemSchema),
  recentActivity: Type.Array(StudyActivityItemSchema),
});

export type StudyDetail = Static<typeof StudyDetailSchema>;

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
    durationMinutes: Type.Number({ minimum: 5, maximum: 120 }),
  },
  { additionalProperties: false },
);

export type CreateStudyInput = Static<typeof CreateStudyInputSchema>;

export const CreateStudyResponseSchema = Type.Object({
  studyId: Type.String(),
  study: StudySummarySchema,
});

export type CreateStudyResponse = Static<typeof CreateStudyResponseSchema>;
