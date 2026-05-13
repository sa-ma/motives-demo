CREATE TYPE "public"."analysis_job_kind" AS ENUM('plan-generation', 'session-debrief', 'study-aggregate');--> statement-breakpoint
CREATE TYPE "public"."analysis_job_status" AS ENUM('queued', 'running', 'completed', 'failed', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."participant_field_type" AS ENUM('text', 'select', 'radio', 'checkbox');--> statement-breakpoint
CREATE TYPE "public"."plan_kind" AS ENUM('draft', 'approved');--> statement-breakpoint
CREATE TYPE "public"."session_status" AS ENUM('welcome', 'details', 'preparing', 'room', 'complete', 'expired');--> statement-breakpoint
CREATE TYPE "public"."study_status" AS ENUM('planning', 'interviewing', 'analyzing', 'completed', 'archived');--> statement-breakpoint
CREATE TYPE "public"."transcript_role" AS ENUM('assistant', 'user');--> statement-breakpoint
CREATE TABLE "analysis_job" (
	"id" text PRIMARY KEY NOT NULL,
	"kind" "analysis_job_kind" NOT NULL,
	"status" "analysis_job_status" NOT NULL,
	"study_id" text NOT NULL,
	"session_id" text,
	"payload" jsonb NOT NULL,
	"attempt_count" integer DEFAULT 0 NOT NULL,
	"locked_at" timestamp with time zone,
	"scheduled_at" timestamp with time zone NOT NULL,
	"error" text,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "debrief_report" (
	"session_id" text PRIMARY KEY NOT NULL,
	"study_id" text NOT NULL,
	"emotion_signal" text NOT NULL,
	"contradictions" jsonb NOT NULL,
	"content" jsonb NOT NULL,
	"model" text NOT NULL,
	"provider_response_id" text,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "interview_session" (
	"id" text PRIMARY KEY NOT NULL,
	"study_id" text NOT NULL,
	"session_status" "session_status" NOT NULL,
	"participant_number" integer NOT NULL,
	"browser_session_token_hash" text,
	"created_at" timestamp with time zone NOT NULL,
	"last_activity_at" timestamp with time zone,
	"updated_at" timestamp with time zone NOT NULL,
	"completed_at" timestamp with time zone,
	CONSTRAINT "interview_session_browser_session_token_hash_unique" UNIQUE("browser_session_token_hash")
);
--> statement-breakpoint
CREATE TABLE "participant_field" (
	"id" text PRIMARY KEY NOT NULL,
	"study_id" text NOT NULL,
	"field_key" text NOT NULL,
	"label" text NOT NULL,
	"type" "participant_field_type" NOT NULL,
	"options" jsonb,
	"required" boolean DEFAULT false NOT NULL,
	"placeholder" text,
	"helper_text" text,
	"sort_order" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "participant_profile" (
	"id" text PRIMARY KEY NOT NULL,
	"session_id" text NOT NULL,
	"responses" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"consent_accepted" boolean DEFAULT false NOT NULL,
	"consented_at" timestamp with time zone,
	CONSTRAINT "participant_profile_session_id_unique" UNIQUE("session_id")
);
--> statement-breakpoint
CREATE TABLE "session_annotation" (
	"id" text PRIMARY KEY NOT NULL,
	"session_id" text NOT NULL,
	"user_turn_id" text NOT NULL,
	"assistant_turn_id" text NOT NULL,
	"progress_state" jsonb NOT NULL,
	"emotion_signal" text NOT NULL,
	"evidence_quotes" jsonb NOT NULL,
	"contradictions" jsonb NOT NULL,
	"created_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "study" (
	"id" text PRIMARY KEY NOT NULL,
	"slug" text NOT NULL,
	"title" text NOT NULL,
	"objective" text NOT NULL,
	"audience" text NOT NULL,
	"context" text NOT NULL,
	"duration_minutes" integer NOT NULL,
	"status" "study_status" NOT NULL,
	"interviews_target" integer NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	CONSTRAINT "study_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "study_aggregate" (
	"study_id" text PRIMARY KEY NOT NULL,
	"coverage" integer DEFAULT 0 NOT NULL,
	"contradiction_count" integer DEFAULT 0 NOT NULL,
	"completed_session_count" integer DEFAULT 0 NOT NULL,
	"signal_count" integer DEFAULT 0 NOT NULL,
	"themes" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"hidden_themes_count" integer DEFAULT 0 NOT NULL,
	"topic_coverage" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"observation" text NOT NULL,
	"updated_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "study_invite" (
	"id" text PRIMARY KEY NOT NULL,
	"study_id" text NOT NULL,
	"invite_code" text NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"revoked_at" timestamp with time zone,
	CONSTRAINT "study_invite_invite_code_unique" UNIQUE("invite_code")
);
--> statement-breakpoint
CREATE TABLE "study_plan_version" (
	"id" text PRIMARY KEY NOT NULL,
	"study_id" text NOT NULL,
	"kind" "plan_kind" NOT NULL,
	"version_number" integer NOT NULL,
	"is_current" boolean DEFAULT true NOT NULL,
	"content" jsonb NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "study_topic" (
	"id" text PRIMARY KEY NOT NULL,
	"study_id" text NOT NULL,
	"label" text NOT NULL,
	"sort_order" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "transcript_turn" (
	"id" text PRIMARY KEY NOT NULL,
	"session_id" text NOT NULL,
	"client_message_id" text,
	"provider_response_id" text,
	"role" "transcript_role" NOT NULL,
	"text" text NOT NULL,
	"model" text,
	"finish_reason" text,
	"timestamp_label" text NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"sort_order" integer NOT NULL
);
--> statement-breakpoint
ALTER TABLE "analysis_job" ADD CONSTRAINT "analysis_job_study_id_study_id_fk" FOREIGN KEY ("study_id") REFERENCES "public"."study"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "analysis_job" ADD CONSTRAINT "analysis_job_session_id_interview_session_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."interview_session"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "debrief_report" ADD CONSTRAINT "debrief_report_session_id_interview_session_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."interview_session"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "debrief_report" ADD CONSTRAINT "debrief_report_study_id_study_id_fk" FOREIGN KEY ("study_id") REFERENCES "public"."study"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "interview_session" ADD CONSTRAINT "interview_session_study_id_study_id_fk" FOREIGN KEY ("study_id") REFERENCES "public"."study"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "participant_field" ADD CONSTRAINT "participant_field_study_id_study_id_fk" FOREIGN KEY ("study_id") REFERENCES "public"."study"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "participant_profile" ADD CONSTRAINT "participant_profile_session_id_interview_session_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."interview_session"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session_annotation" ADD CONSTRAINT "session_annotation_session_id_interview_session_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."interview_session"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session_annotation" ADD CONSTRAINT "session_annotation_user_turn_id_transcript_turn_id_fk" FOREIGN KEY ("user_turn_id") REFERENCES "public"."transcript_turn"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session_annotation" ADD CONSTRAINT "session_annotation_assistant_turn_id_transcript_turn_id_fk" FOREIGN KEY ("assistant_turn_id") REFERENCES "public"."transcript_turn"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "study_aggregate" ADD CONSTRAINT "study_aggregate_study_id_study_id_fk" FOREIGN KEY ("study_id") REFERENCES "public"."study"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "study_invite" ADD CONSTRAINT "study_invite_study_id_study_id_fk" FOREIGN KEY ("study_id") REFERENCES "public"."study"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "study_plan_version" ADD CONSTRAINT "study_plan_version_study_id_study_id_fk" FOREIGN KEY ("study_id") REFERENCES "public"."study"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "study_topic" ADD CONSTRAINT "study_topic_study_id_study_id_fk" FOREIGN KEY ("study_id") REFERENCES "public"."study"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transcript_turn" ADD CONSTRAINT "transcript_turn_session_id_interview_session_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."interview_session"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "analysis_job_open_session_unique" ON "analysis_job" USING btree ("kind","study_id","session_id") WHERE "analysis_job"."status" in ('queued', 'running') and "analysis_job"."session_id" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "analysis_job_open_study_unique" ON "analysis_job" USING btree ("kind","study_id") WHERE "analysis_job"."status" in ('queued', 'running') and "analysis_job"."session_id" is null;--> statement-breakpoint
CREATE INDEX "idx_analysis_job_status_scheduled" ON "analysis_job" USING btree ("status","scheduled_at","created_at");--> statement-breakpoint
CREATE INDEX "idx_analysis_job_session_kind" ON "analysis_job" USING btree ("session_id","kind");--> statement-breakpoint
CREATE INDEX "idx_analysis_job_study_kind" ON "analysis_job" USING btree ("study_id","kind");--> statement-breakpoint
CREATE INDEX "idx_debrief_report_study" ON "debrief_report" USING btree ("study_id","updated_at");--> statement-breakpoint
CREATE INDEX "idx_session_study" ON "interview_session" USING btree ("study_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "participant_field_study_field_key_unique" ON "participant_field" USING btree ("study_id","field_key");--> statement-breakpoint
CREATE INDEX "idx_participant_field_study" ON "participant_field" USING btree ("study_id","sort_order");--> statement-breakpoint
CREATE UNIQUE INDEX "session_annotation_assistant_turn_unique" ON "session_annotation" USING btree ("assistant_turn_id");--> statement-breakpoint
CREATE INDEX "idx_session_annotation_session" ON "session_annotation" USING btree ("session_id","created_at");--> statement-breakpoint
CREATE INDEX "idx_study_invite_study_active_created" ON "study_invite" USING btree ("study_id","created_at") WHERE "study_invite"."revoked_at" is null;--> statement-breakpoint
CREATE UNIQUE INDEX "study_invite_active_unique" ON "study_invite" USING btree ("study_id") WHERE "study_invite"."revoked_at" is null;--> statement-breakpoint
CREATE UNIQUE INDEX "study_plan_current_unique" ON "study_plan_version" USING btree ("study_id","kind") WHERE "study_plan_version"."is_current" = true;--> statement-breakpoint
CREATE INDEX "idx_plan_study_kind_version" ON "study_plan_version" USING btree ("study_id","kind","version_number");--> statement-breakpoint
CREATE INDEX "idx_study_topic_study" ON "study_topic" USING btree ("study_id","sort_order");--> statement-breakpoint
CREATE UNIQUE INDEX "transcript_turn_session_client_message_unique" ON "transcript_turn" USING btree ("session_id","client_message_id") WHERE "transcript_turn"."client_message_id" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "transcript_turn_session_sort_order_unique" ON "transcript_turn" USING btree ("session_id","sort_order");--> statement-breakpoint
CREATE INDEX "idx_transcript_session" ON "transcript_turn" USING btree ("session_id","sort_order");