CREATE TYPE "public"."analysis_job_kind" AS ENUM('session-debrief', 'study-aggregate');--> statement-breakpoint
CREATE TYPE "public"."analysis_job_status" AS ENUM('queued', 'running', 'completed', 'failed', 'cancelled');--> statement-breakpoint
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
ALTER TABLE "study_aggregate" ADD COLUMN "contradiction_count" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "study_aggregate" ADD COLUMN "completed_session_count" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "study_aggregate" ADD COLUMN "topic_coverage" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "analysis_job" ADD CONSTRAINT "analysis_job_study_id_study_id_fk" FOREIGN KEY ("study_id") REFERENCES "public"."study"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "analysis_job" ADD CONSTRAINT "analysis_job_session_id_interview_session_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."interview_session"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "debrief_report" ADD CONSTRAINT "debrief_report_session_id_interview_session_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."interview_session"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "debrief_report" ADD CONSTRAINT "debrief_report_study_id_study_id_fk" FOREIGN KEY ("study_id") REFERENCES "public"."study"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_analysis_job_status_scheduled" ON "analysis_job" USING btree ("status","scheduled_at","created_at");--> statement-breakpoint
CREATE INDEX "idx_analysis_job_session_kind" ON "analysis_job" USING btree ("session_id","kind");--> statement-breakpoint
CREATE INDEX "idx_analysis_job_study_kind" ON "analysis_job" USING btree ("study_id","kind");--> statement-breakpoint
CREATE INDEX "idx_debrief_report_study" ON "debrief_report" USING btree ("study_id","updated_at");