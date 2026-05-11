CREATE INDEX IF NOT EXISTS idx_interview_invite_study_active_created
ON interview_invite (study_id, created_at)
WHERE revoked_at IS NULL;
