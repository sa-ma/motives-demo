import { and, desc, eq, sql } from "drizzle-orm";

import type { StudyPlan } from "@motives-ai/contracts";

import type { DatabaseExecutor } from "../client.js";
import { studyPlanVersion } from "../schema.js";
import { hydrateStudyPlanDerivedFields } from "../../lib/study-plan-derived.js";

export async function findCurrentPlanVersion(
  db: DatabaseExecutor,
  studyId: string,
  kind: "draft" | "approved",
) {
  return db.query.studyPlanVersion.findFirst({
    where: and(
      eq(studyPlanVersion.studyId, studyId),
      eq(studyPlanVersion.kind, kind),
      eq(studyPlanVersion.isCurrent, true),
    ),
    orderBy: [desc(studyPlanVersion.versionNumber)],
  });
}

export async function findCurrentDraftPlan(db: DatabaseExecutor, studyId: string) {
  const row = await findCurrentPlanVersion(db, studyId, "draft");
  return row ? hydrateStudyPlanDerivedFields(row.content) : null;
}

export async function findCurrentApprovedPlan(db: DatabaseExecutor, studyId: string) {
  const row = await findCurrentPlanVersion(db, studyId, "approved");
  return row ? hydrateStudyPlanDerivedFields(row.content) : null;
}

export async function findCurrentPlan(db: DatabaseExecutor, studyId: string) {
  return (await findCurrentDraftPlan(db, studyId)) ?? (await findCurrentApprovedPlan(db, studyId));
}

export async function getHighestPlanVersion(
  db: DatabaseExecutor,
  studyId: string,
  kind: "draft" | "approved",
) {
  const rows = await db
    .select({
      version: sql<number>`coalesce(max(${studyPlanVersion.versionNumber}), 0)`.mapWith(Number),
    })
    .from(studyPlanVersion)
    .where(
      and(eq(studyPlanVersion.studyId, studyId), eq(studyPlanVersion.kind, kind)),
    );

  return rows[0]?.version ?? 0;
}

export async function saveDraftPlan(
  db: DatabaseExecutor,
  options: {
    createdAt: string;
    draftPlanId: string;
    plan: StudyPlan;
    studyId: string;
    versionNumber: number;
  },
) {
  const currentDraft = await findCurrentPlanVersion(db, options.studyId, "draft");

  if (currentDraft) {
    await db
      .update(studyPlanVersion)
      .set({
        content: options.plan,
        updatedAt: options.createdAt,
        versionNumber: options.versionNumber,
      })
      .where(eq(studyPlanVersion.id, currentDraft.id));

    return currentDraft.id;
  }

  await db.insert(studyPlanVersion).values({
    id: options.draftPlanId,
    studyId: options.studyId,
    kind: "draft",
    versionNumber: options.versionNumber,
    isCurrent: true,
    content: options.plan,
    createdAt: options.createdAt,
    updatedAt: options.createdAt,
  });

  return options.draftPlanId;
}

export async function updateDraftPlanContent(
  db: DatabaseExecutor,
  draftPlanId: string,
  plan: StudyPlan,
  updatedAt: string,
) {
  await db
    .update(studyPlanVersion)
    .set({
      content: plan,
      updatedAt,
    })
    .where(eq(studyPlanVersion.id, draftPlanId));
}

export async function replaceCurrentApprovedPlan(
  db: DatabaseExecutor,
  options: {
    approvedAt: string;
    approvedPlanVersionId: string;
    plan: StudyPlan;
    studyId: string;
    versionNumber: number;
  },
) {
  await db
    .update(studyPlanVersion)
    .set({ isCurrent: false })
    .where(
      and(
        eq(studyPlanVersion.studyId, options.studyId),
        eq(studyPlanVersion.kind, "approved"),
        eq(studyPlanVersion.isCurrent, true),
      ),
    );

  await db.insert(studyPlanVersion).values({
    id: options.approvedPlanVersionId,
    studyId: options.studyId,
    kind: "approved",
    versionNumber: options.versionNumber,
    isCurrent: true,
    content: options.plan,
    createdAt: options.approvedAt,
    updatedAt: options.approvedAt,
  });
}
