import { randomBytes } from "node:crypto";

import { and, asc, desc, eq, gt, inArray, isNull, sql } from "drizzle-orm";

import type { DatabaseExecutor } from "../client.js";
import {
  studyInvite,
  interviewInvite,
  interviewSession,
  participantProfile,
} from "../schema.js";

export async function createInviteCode(db: DatabaseExecutor) {
  for (;;) {
    const candidate = `SI${randomBytes(5).toString("hex").toUpperCase()}`;

    const existingStudyInvite = await db.query.studyInvite.findFirst({
      columns: { id: true },
      where: eq(studyInvite.inviteCode, candidate),
    });

    if (existingStudyInvite) {
      continue;
    }

    const existing = await db.query.interviewInvite.findFirst({
      columns: { id: true },
      where: eq(interviewInvite.inviteCode, candidate),
    });

    if (!existing) {
      return candidate;
    }
  }
}

export async function createStudyInvite(
  db: DatabaseExecutor,
  values: typeof studyInvite.$inferInsert,
) {
  await db.insert(studyInvite).values(values);
}

export async function createInterviewSession(
  db: DatabaseExecutor,
  values: typeof interviewSession.$inferInsert,
) {
  await db.insert(interviewSession).values(values);
}

export async function createInterviewInvite(
  db: DatabaseExecutor,
  values: typeof interviewInvite.$inferInsert,
) {
  await db.insert(interviewInvite).values(values);
}

export async function createParticipantProfile(
  db: DatabaseExecutor,
  values: typeof participantProfile.$inferInsert,
) {
  await db.insert(participantProfile).values(values);
}

export async function findStudyInviteByCode(
  db: DatabaseExecutor,
  inviteCode: string,
) {
  return db.query.studyInvite.findFirst({
    where: eq(studyInvite.inviteCode, inviteCode.toUpperCase()),
  });
}

export async function findInviteWithSession(db: DatabaseExecutor, inviteCode: string) {
  const normalizedCode = inviteCode.toUpperCase();
  const invite = await db.query.interviewInvite.findFirst({
    where: eq(interviewInvite.inviteCode, normalizedCode),
  });

  if (!invite) {
    return null;
  }

  const session = await db.query.interviewSession.findFirst({
    where: eq(interviewSession.id, invite.sessionId),
  });

  if (!session) {
    throw new Error("Interview session is missing.");
  }

  return {
    invite,
    session,
  };
}

export async function findActiveStudyInviteForStudy(
  db: DatabaseExecutor,
  studyId: string,
  now: string,
) {
  return db.query.studyInvite.findFirst({
    orderBy: [desc(studyInvite.createdAt)],
    where: and(
      eq(studyInvite.studyId, studyId),
      isNull(studyInvite.revokedAt),
      gt(studyInvite.expiresAt, now),
    ),
  });
}

export async function revokeExpiredStudyInvitesForStudy(
  db: DatabaseExecutor,
  options: {
    now: string;
    revokedAt: string;
    studyId: string;
  },
) {
  await db.execute(sql`
    update study_invite
    set revoked_at = ${options.revokedAt}
    where
      study_id = ${options.studyId}
      and revoked_at is null
      and expires_at <= ${options.now}
  `);
}

export async function findLatestActiveInviteForStudy(
  db: DatabaseExecutor,
  studyId: string,
  now: string,
) {
  return db.query.interviewInvite.findFirst({
    orderBy: [desc(interviewInvite.createdAt)],
    where: and(
      eq(interviewInvite.studyId, studyId),
      isNull(interviewInvite.revokedAt),
      gt(interviewInvite.expiresAt, now),
    ),
  });
}

export async function listActiveStudyInvitesForStudies(
  db: DatabaseExecutor,
  options: {
    now: string;
    studyIds: string[];
  },
) {
  if (options.studyIds.length === 0) {
    return [];
  }

  return db.query.studyInvite.findMany({
    orderBy: [asc(studyInvite.studyId), desc(studyInvite.createdAt)],
    where: and(
      inArray(studyInvite.studyId, options.studyIds),
      isNull(studyInvite.revokedAt),
      gt(studyInvite.expiresAt, options.now),
    ),
  });
}

export async function listLatestActiveInvitesForStudies(
  db: DatabaseExecutor,
  options: {
    now: string;
    studyIds: string[];
  },
) {
  if (options.studyIds.length === 0) {
    return [];
  }

  return db.query.interviewInvite.findMany({
    orderBy: [asc(interviewInvite.studyId), desc(interviewInvite.createdAt)],
    where: and(
      inArray(interviewInvite.studyId, options.studyIds),
      isNull(interviewInvite.revokedAt),
      gt(interviewInvite.expiresAt, options.now),
    ),
  });
}

export async function listLatestActiveInvitesForSessions(
  db: DatabaseExecutor,
  options: {
    now: string;
    sessionIds: string[];
  },
) {
  if (options.sessionIds.length === 0) {
    return [];
  }

  return db.query.interviewInvite.findMany({
    orderBy: [asc(interviewInvite.sessionId), desc(interviewInvite.createdAt)],
    where: and(
      inArray(interviewInvite.sessionId, options.sessionIds),
      isNull(interviewInvite.revokedAt),
      gt(interviewInvite.expiresAt, options.now),
    ),
  });
}

export async function findSessionById(db: DatabaseExecutor, sessionId: string) {
  return db.query.interviewSession.findFirst({
    where: eq(interviewSession.id, sessionId),
  });
}

export async function findSessionByBrowserSessionTokenHash(
  db: DatabaseExecutor,
  browserSessionTokenHash: string,
) {
  return db.query.interviewSession.findFirst({
    where: eq(interviewSession.browserSessionTokenHash, browserSessionTokenHash),
  });
}

export async function updateInterviewSessionState(
  db: DatabaseExecutor,
  sessionId: string,
  values: Partial<typeof interviewSession.$inferInsert>,
) {
  await db
    .update(interviewSession)
    .set(values)
    .where(eq(interviewSession.id, sessionId));
}

export async function findParticipantProfileBySessionId(
  db: DatabaseExecutor,
  sessionId: string,
) {
  return db.query.participantProfile.findFirst({
    where: eq(participantProfile.sessionId, sessionId),
  });
}

export async function updateParticipantProfileBySessionId(
  db: DatabaseExecutor,
  sessionId: string,
  values: Partial<typeof participantProfile.$inferInsert>,
) {
  await db
    .update(participantProfile)
    .set(values)
    .where(eq(participantProfile.sessionId, sessionId));
}
