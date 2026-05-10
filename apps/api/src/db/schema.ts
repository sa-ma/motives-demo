import type {
  InterviewBehaviorId,
  StudyPlan,
} from "@motives-ai/contracts/plans";
import type {
  InterviewProgressState,
  InterviewSessionStatus,
  ParticipantFieldOption,
  ParticipantIntakeField,
  ParticipantResponses,
} from "@motives-ai/contracts/public-interviews";
import type { StudyStatus } from "@motives-ai/contracts/studies";
import {
  boolean,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

export const studyStatusEnum = pgEnum("study_status", [
  "planning",
  "interviewing",
  "analyzing",
  "completed",
]);

export const planKindEnum = pgEnum("plan_kind", ["draft", "approved"]);

export const sessionStatusEnum = pgEnum("session_status", [
  "welcome",
  "details",
  "preparing",
  "room",
  "complete",
  "expired",
]);

export const participantFieldTypeEnum = pgEnum("participant_field_type", [
  "text",
  "select",
  "radio",
  "checkbox",
]);

export const transcriptRoleEnum = pgEnum("transcript_role", ["assistant", "user"]);

export const study = pgTable(
  "study",
  {
    id: text("id").primaryKey(),
    slug: text("slug").notNull().unique(),
    title: text("title").notNull(),
    objective: text("objective").notNull(),
    audience: text("audience").notNull(),
    context: text("context").notNull(),
    durationMinutes: integer("duration_minutes").notNull(),
    status: studyStatusEnum("status").$type<StudyStatus>().notNull(),
    interviewsTarget: integer("interviews_target").notNull().default(10),
    createdAt: timestamp("created_at", { mode: "string", withTimezone: true }).notNull(),
    updatedAt: timestamp("updated_at", { mode: "string", withTimezone: true }).notNull(),
  },
  () => ({}),
);

export const studyTopic = pgTable(
  "study_topic",
  {
    id: text("id").primaryKey(),
    studyId: text("study_id")
      .notNull()
      .references(() => study.id, { onDelete: "cascade" }),
    label: text("label").notNull(),
    sortOrder: integer("sort_order").notNull(),
  },
  (table) => ({
    studySortIdx: index("idx_study_topic_study").on(table.studyId, table.sortOrder),
  }),
);

export const studyPlanVersion = pgTable(
  "study_plan_version",
  {
    id: text("id").primaryKey(),
    studyId: text("study_id")
      .notNull()
      .references(() => study.id, { onDelete: "cascade" }),
    kind: planKindEnum("kind").$type<"draft" | "approved">().notNull(),
    versionNumber: integer("version_number").notNull(),
    isCurrent: boolean("is_current").notNull().default(true),
    content: jsonb("content")
      .$type<StudyPlan>()
      .notNull(),
    createdAt: timestamp("created_at", { mode: "string", withTimezone: true }).notNull(),
    updatedAt: timestamp("updated_at", { mode: "string", withTimezone: true }).notNull(),
  },
  (table) => ({
    currentPlanUniqueIdx: uniqueIndex("study_plan_current_unique")
      .on(table.studyId, table.kind)
      .where(sql`${table.isCurrent} = true`),
    studyKindVersionIdx: index("idx_plan_study_kind_version").on(
      table.studyId,
      table.kind,
      table.versionNumber,
    ),
  }),
);

export const studyAggregate = pgTable("study_aggregate", {
  studyId: text("study_id")
    .primaryKey()
    .references(() => study.id, { onDelete: "cascade" }),
  coverage: integer("coverage").notNull().default(0),
  signalCount: integer("signal_count").notNull().default(0),
  themes: jsonb("themes").$type<string[]>().notNull().default(sql`'[]'::jsonb`),
  hiddenThemesCount: integer("hidden_themes_count").notNull().default(0),
  observation: text("observation").notNull(),
  updatedAt: timestamp("updated_at", { mode: "string", withTimezone: true }).notNull(),
});

export const participantField = pgTable(
  "participant_field",
  {
    id: text("id").primaryKey(),
    studyId: text("study_id")
      .notNull()
      .references(() => study.id, { onDelete: "cascade" }),
    fieldKey: text("field_key").notNull(),
    label: text("label").notNull(),
    type: participantFieldTypeEnum("type")
      .$type<ParticipantIntakeField["type"]>()
      .notNull(),
    options: jsonb("options").$type<ParticipantFieldOption[] | null>(),
    required: boolean("required").notNull().default(false),
    placeholder: text("placeholder"),
    helperText: text("helper_text"),
    sortOrder: integer("sort_order").notNull(),
  },
  (table) => ({
    studyFieldUniqueIdx: uniqueIndex("participant_field_study_field_key_unique").on(
      table.studyId,
      table.fieldKey,
    ),
    studySortIdx: index("idx_participant_field_study").on(table.studyId, table.sortOrder),
  }),
);

export const interviewSession = pgTable(
  "interview_session",
  {
    id: text("id").primaryKey(),
    studyId: text("study_id")
      .notNull()
      .references(() => study.id, { onDelete: "cascade" }),
    sessionStatus: sessionStatusEnum("session_status")
      .$type<InterviewSessionStatus>()
      .notNull(),
    participantNumber: integer("participant_number").notNull(),
    createdAt: timestamp("created_at", { mode: "string", withTimezone: true }).notNull(),
    updatedAt: timestamp("updated_at", { mode: "string", withTimezone: true }).notNull(),
    completedAt: timestamp("completed_at", { mode: "string", withTimezone: true }),
  },
  (table) => ({
    studyCreatedIdx: index("idx_session_study").on(table.studyId, table.createdAt),
  }),
);

export const interviewInvite = pgTable(
  "interview_invite",
  {
    id: text("id").primaryKey(),
    studyId: text("study_id")
      .notNull()
      .references(() => study.id, { onDelete: "cascade" }),
    sessionId: text("session_id")
      .notNull()
      .references(() => interviewSession.id, { onDelete: "cascade" })
      .unique(),
    inviteCode: text("invite_code").notNull().unique(),
    createdAt: timestamp("created_at", { mode: "string", withTimezone: true }).notNull(),
    expiresAt: timestamp("expires_at", { mode: "string", withTimezone: true }).notNull(),
    revokedAt: timestamp("revoked_at", { mode: "string", withTimezone: true }),
  },
  () => ({}),
);

export const participantProfile = pgTable("participant_profile", {
  id: text("id").primaryKey(),
  sessionId: text("session_id")
    .notNull()
    .references(() => interviewSession.id, { onDelete: "cascade" })
    .unique(),
  responses: jsonb("responses")
    .$type<ParticipantResponses>()
    .notNull()
    .default(sql`'{}'::jsonb`),
  consentAccepted: boolean("consent_accepted").notNull().default(false),
  consentedAt: timestamp("consented_at", { mode: "string", withTimezone: true }),
});

export const transcriptTurn = pgTable(
  "transcript_turn",
  {
    id: text("id").primaryKey(),
    sessionId: text("session_id")
      .notNull()
      .references(() => interviewSession.id, { onDelete: "cascade" }),
    clientMessageId: text("client_message_id"),
    providerResponseId: text("provider_response_id"),
    role: transcriptRoleEnum("role").$type<"assistant" | "user">().notNull(),
    text: text("text").notNull(),
    model: text("model"),
    finishReason: text("finish_reason"),
    timestampLabel: text("timestamp_label").notNull(),
    createdAt: timestamp("created_at", { mode: "string", withTimezone: true }).notNull(),
    sortOrder: integer("sort_order").notNull(),
  },
  (table) => ({
    sessionClientMessageUniqueIdx: uniqueIndex(
      "transcript_turn_session_client_message_unique",
    )
      .on(table.sessionId, table.clientMessageId)
      .where(sql`${table.clientMessageId} is not null`),
    sessionSortUniqueIdx: uniqueIndex("transcript_turn_session_sort_order_unique").on(
      table.sessionId,
      table.sortOrder,
    ),
    sessionSortIdx: index("idx_transcript_session").on(table.sessionId, table.sortOrder),
  }),
);

export const sessionAnnotation = pgTable(
  "session_annotation",
  {
    id: text("id").primaryKey(),
    sessionId: text("session_id")
      .notNull()
      .references(() => interviewSession.id, { onDelete: "cascade" }),
    userTurnId: text("user_turn_id")
      .notNull()
      .references(() => transcriptTurn.id, { onDelete: "cascade" }),
    assistantTurnId: text("assistant_turn_id")
      .notNull()
      .references(() => transcriptTurn.id, { onDelete: "cascade" }),
    progressState: jsonb("progress_state").$type<InterviewProgressState>().notNull(),
    emotionSignal: text("emotion_signal").$type<"low" | "medium" | "high">().notNull(),
    evidenceQuotes: jsonb("evidence_quotes").$type<string[]>().notNull(),
    contradictions: jsonb("contradictions").$type<string[]>().notNull(),
    createdAt: timestamp("created_at", { mode: "string", withTimezone: true }).notNull(),
  },
  (table) => ({
    assistantTurnUniqueIdx: uniqueIndex("session_annotation_assistant_turn_unique").on(
      table.assistantTurnId,
    ),
    sessionCreatedIdx: index("idx_session_annotation_session").on(
      table.sessionId,
      table.createdAt,
    ),
  }),
);

export type StudyRow = typeof study.$inferSelect;
export type StudyTopicRow = typeof studyTopic.$inferSelect;
export type StudyPlanVersionRow = typeof studyPlanVersion.$inferSelect;
export type StudyAggregateRow = typeof studyAggregate.$inferSelect;
export type ParticipantFieldRow = typeof participantField.$inferSelect;
export type InterviewSessionRow = typeof interviewSession.$inferSelect;
export type InterviewInviteRow = typeof interviewInvite.$inferSelect;
export type ParticipantProfileRow = typeof participantProfile.$inferSelect;
export type TranscriptTurnRow = typeof transcriptTurn.$inferSelect;
export type SessionAnnotationRow = typeof sessionAnnotation.$inferSelect;

export type StoredInterviewBehaviorId = InterviewBehaviorId;
