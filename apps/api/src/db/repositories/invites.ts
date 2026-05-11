import { randomBytes } from "node:crypto";

import { and, asc, desc, eq, gt, inArray, isNull } from "drizzle-orm";

import type { DatabaseExecutor } from "../client.js";
import {
  interviewInvite,
  interviewSession,
  participantProfile,
} from "../schema.js";

export async function createInviteCode(db: DatabaseExecutor) {
  for (;;) {
    const candidate = randomBytes(8).toString("hex").toUpperCase().slice(0, 12);

    const existing = await db.query.interviewInvite.findFirst({
      columns: { id: true },
      where: eq(interviewInvite.inviteCode, candidate),
    });

    if (!existing) {
      return candidate;
    }
  }
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
