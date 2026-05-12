ALTER TABLE "interview_session"
  ADD COLUMN IF NOT EXISTS "browser_session_token_hash" text;

ALTER TABLE "interview_session"
  ADD COLUMN IF NOT EXISTS "last_activity_at" timestamp with time zone;

UPDATE "interview_session"
SET "last_activity_at" = coalesce("last_activity_at", "updated_at")
WHERE "last_activity_at" IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS "interview_session_browser_session_token_hash_unique"
  ON "interview_session" USING btree ("browser_session_token_hash");

CREATE TABLE IF NOT EXISTS "study_invite" (
  "id" text PRIMARY KEY NOT NULL,
  "study_id" text NOT NULL REFERENCES "study"("id") ON DELETE cascade,
  "invite_code" text NOT NULL,
  "created_at" timestamp with time zone NOT NULL,
  "expires_at" timestamp with time zone NOT NULL,
  "revoked_at" timestamp with time zone
);

CREATE UNIQUE INDEX IF NOT EXISTS "study_invite_invite_code_unique"
  ON "study_invite" USING btree ("invite_code");

CREATE INDEX IF NOT EXISTS "idx_study_invite_study_active_created"
  ON "study_invite" USING btree ("study_id", "created_at")
  WHERE "study_invite"."revoked_at" IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS "study_invite_active_unique"
  ON "study_invite" USING btree ("study_id")
  WHERE "study_invite"."revoked_at" IS NULL;

WITH active_legacy_invites AS (
  SELECT DISTINCT ON ("study_id")
    "study_id",
    "expires_at"
  FROM "interview_invite"
  WHERE "revoked_at" IS NULL
    AND "expires_at" > now()
  ORDER BY "study_id", "created_at" DESC
)
INSERT INTO "study_invite" (
  "id",
  "study_id",
  "invite_code",
  "created_at",
  "expires_at",
  "revoked_at"
)
SELECT
  'invite_backfill_' || active_legacy_invites."study_id",
  active_legacy_invites."study_id",
  'SI' || upper(md5(active_legacy_invites."study_id" || ':study_invite_backfill')),
  now(),
  active_legacy_invites."expires_at",
  NULL
FROM active_legacy_invites
WHERE NOT EXISTS (
  SELECT 1
  FROM "study_invite"
  WHERE "study_invite"."study_id" = active_legacy_invites."study_id"
    AND "study_invite"."revoked_at" IS NULL
);
