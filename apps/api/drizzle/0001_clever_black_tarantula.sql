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
ALTER TABLE "transcript_turn" ADD COLUMN "client_message_id" text;--> statement-breakpoint
ALTER TABLE "transcript_turn" ADD COLUMN "provider_response_id" text;--> statement-breakpoint
ALTER TABLE "transcript_turn" ADD COLUMN "model" text;--> statement-breakpoint
ALTER TABLE "transcript_turn" ADD COLUMN "finish_reason" text;--> statement-breakpoint
ALTER TABLE "session_annotation" ADD CONSTRAINT "session_annotation_session_id_interview_session_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."interview_session"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session_annotation" ADD CONSTRAINT "session_annotation_user_turn_id_transcript_turn_id_fk" FOREIGN KEY ("user_turn_id") REFERENCES "public"."transcript_turn"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session_annotation" ADD CONSTRAINT "session_annotation_assistant_turn_id_transcript_turn_id_fk" FOREIGN KEY ("assistant_turn_id") REFERENCES "public"."transcript_turn"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "session_annotation_assistant_turn_unique" ON "session_annotation" USING btree ("assistant_turn_id");--> statement-breakpoint
CREATE INDEX "idx_session_annotation_session" ON "session_annotation" USING btree ("session_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "transcript_turn_session_client_message_unique" ON "transcript_turn" USING btree ("session_id","client_message_id") WHERE "transcript_turn"."client_message_id" is not null;