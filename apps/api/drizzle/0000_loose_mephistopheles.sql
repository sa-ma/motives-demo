CREATE TYPE "public"."participant_field_type" AS ENUM('text', 'select', 'radio', 'checkbox');--> statement-breakpoint
CREATE TYPE "public"."plan_kind" AS ENUM('draft', 'approved');--> statement-breakpoint
CREATE TYPE "public"."session_status" AS ENUM('welcome', 'details', 'preparing', 'room', 'complete', 'expired');--> statement-breakpoint
CREATE TYPE "public"."study_status" AS ENUM('planning', 'interviewing', 'analyzing', 'completed');--> statement-breakpoint
CREATE TYPE "public"."transcript_role" AS ENUM('assistant', 'user');--> statement-breakpoint
CREATE TABLE "interview_invite" (
	"id" text PRIMARY KEY NOT NULL,
	"study_id" text NOT NULL,
	"session_id" text NOT NULL,
	"invite_code" text NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"revoked_at" timestamp with time zone,
	CONSTRAINT "interview_invite_session_id_unique" UNIQUE("session_id"),
	CONSTRAINT "interview_invite_invite_code_unique" UNIQUE("invite_code")
);
--> statement-breakpoint
CREATE TABLE "interview_session" (
	"id" text PRIMARY KEY NOT NULL,
	"study_id" text NOT NULL,
	"session_status" "session_status" NOT NULL,
	"participant_number" integer NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	"completed_at" timestamp with time zone
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
CREATE TABLE "study" (
	"id" text PRIMARY KEY NOT NULL,
	"slug" text NOT NULL,
	"title" text NOT NULL,
	"objective" text NOT NULL,
	"audience" text NOT NULL,
	"context" text NOT NULL,
	"duration_minutes" integer NOT NULL,
	"status" "study_status" NOT NULL,
	"interviews_target" integer DEFAULT 10 NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	CONSTRAINT "study_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "study_aggregate" (
	"study_id" text PRIMARY KEY NOT NULL,
	"coverage" integer DEFAULT 0 NOT NULL,
	"signal_count" integer DEFAULT 0 NOT NULL,
	"themes" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"hidden_themes_count" integer DEFAULT 0 NOT NULL,
	"observation" text NOT NULL,
	"updated_at" timestamp with time zone NOT NULL
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
	"role" "transcript_role" NOT NULL,
	"text" text NOT NULL,
	"timestamp_label" text NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"sort_order" integer NOT NULL
);
--> statement-breakpoint
ALTER TABLE "interview_invite" ADD CONSTRAINT "interview_invite_study_id_study_id_fk" FOREIGN KEY ("study_id") REFERENCES "public"."study"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "interview_invite" ADD CONSTRAINT "interview_invite_session_id_interview_session_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."interview_session"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "interview_session" ADD CONSTRAINT "interview_session_study_id_study_id_fk" FOREIGN KEY ("study_id") REFERENCES "public"."study"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "participant_field" ADD CONSTRAINT "participant_field_study_id_study_id_fk" FOREIGN KEY ("study_id") REFERENCES "public"."study"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "participant_profile" ADD CONSTRAINT "participant_profile_session_id_interview_session_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."interview_session"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "study_aggregate" ADD CONSTRAINT "study_aggregate_study_id_study_id_fk" FOREIGN KEY ("study_id") REFERENCES "public"."study"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "study_plan_version" ADD CONSTRAINT "study_plan_version_study_id_study_id_fk" FOREIGN KEY ("study_id") REFERENCES "public"."study"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "study_topic" ADD CONSTRAINT "study_topic_study_id_study_id_fk" FOREIGN KEY ("study_id") REFERENCES "public"."study"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transcript_turn" ADD CONSTRAINT "transcript_turn_session_id_interview_session_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."interview_session"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_session_study" ON "interview_session" USING btree ("study_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "participant_field_study_field_key_unique" ON "participant_field" USING btree ("study_id","field_key");--> statement-breakpoint
CREATE INDEX "idx_participant_field_study" ON "participant_field" USING btree ("study_id","sort_order");--> statement-breakpoint
CREATE UNIQUE INDEX "study_plan_current_unique" ON "study_plan_version" USING btree ("study_id","kind") WHERE "study_plan_version"."is_current" = true;--> statement-breakpoint
CREATE INDEX "idx_plan_study_kind_version" ON "study_plan_version" USING btree ("study_id","kind","version_number");--> statement-breakpoint
CREATE INDEX "idx_study_topic_study" ON "study_topic" USING btree ("study_id","sort_order");--> statement-breakpoint
CREATE UNIQUE INDEX "transcript_turn_session_sort_order_unique" ON "transcript_turn" USING btree ("session_id","sort_order");--> statement-breakpoint
CREATE INDEX "idx_transcript_session" ON "transcript_turn" USING btree ("session_id","sort_order");