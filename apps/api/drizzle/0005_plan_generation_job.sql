ALTER TYPE "public"."analysis_job_kind" ADD VALUE IF NOT EXISTS 'plan-generation';

CREATE UNIQUE INDEX IF NOT EXISTS "analysis_job_open_session_unique"
  ON "analysis_job" USING btree ("kind","study_id","session_id")
  WHERE "analysis_job"."status" in ('queued', 'running') and "analysis_job"."session_id" is not null;

CREATE UNIQUE INDEX IF NOT EXISTS "analysis_job_open_study_unique"
  ON "analysis_job" USING btree ("kind","study_id")
  WHERE "analysis_job"."status" in ('queued', 'running') and "analysis_job"."session_id" is null;
