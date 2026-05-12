import type { SessionDebrief, StudyDetail, StudyStatus } from "@motives-ai/contracts";

import type { DatabaseExecutor } from "../../db/client.js";
import {
  listDebriefReportsForStudy,
} from "../../db/repositories/analysis.js";
import {
  findCurrentApprovedPlan,
  findCurrentDraftPlan,
} from "../../db/repositories/plans.js";
import {
  countSessions,
  findStudyAggregate,
  findStudyById,
  findStudyTopics,
  updateStudyStatus,
  upsertStudyAggregate,
} from "../../db/repositories/studies.js";
import { ApiError } from "../errors.js";
import { buildStudyTopicCoverageFromDebriefs } from "../study-analysis.js";

function nowIso() {
  return new Date().toISOString();
}

function normalizeTopics(topics: string[]) {
  const seen = new Set<string>();

  return topics
    .map((topic) => topic.trim())
    .filter((topic) => {
      if (!topic) {
        return false;
      }

      const normalized = topic.toLowerCase();

      if (seen.has(normalized)) {
        return false;
      }

      seen.add(normalized);
      return true;
    });
}

export function computeStudyStatus(
  study: Awaited<ReturnType<typeof findStudyById>> extends infer T ? NonNullable<T> : never,
  counts: Awaited<ReturnType<typeof countSessions>>,
): StudyStatus {
  if (study.status === "completed") {
    return "completed";
  }

  if (study.status === "archived") {
    return "archived";
  }

  if (counts.active > 0) {
    return "interviewing";
  }

  if (counts.completed > 0 && counts.completed >= study.interviewsTarget) {
    return "analyzing";
  }

  if (counts.total > 0) {
    return "interviewing";
  }

  return "planning";
}

export function buildStudyObservation(options: {
  completedSessions: number;
  hasApprovedPlan: boolean;
  liveSessions: number;
  status: StudyStatus;
  totalSessions: number;
}) {
  const { completedSessions, hasApprovedPlan, liveSessions, status, totalSessions } = options;

  if (status === "completed") {
    return "This study has been ended and is now read-only. Existing transcripts, debriefs, and aggregate analysis remain available.";
  }

  if (status === "archived") {
    return "This study has been archived and removed from the default studies list. Existing transcripts, debriefs, and aggregate analysis remain available.";
  }

  if (status === "analyzing") {
    return "Completed interview debriefs are being synthesized into study-level analysis.";
  }

  if (status === "interviewing") {
    if (liveSessions > 0) {
      return "Participant sessions are in progress and their analysis will update after each completed interview.";
    }

    if (completedSessions > 0) {
      return "Completed sessions are accumulating and the study is ready for richer analysis.";
    }

    return "The study is ready for interviews and invite-driven participant sessions.";
  }

  if (hasApprovedPlan) {
    return "The interview plan is approved. Create an invite to begin the first participant session.";
  }

  if (totalSessions > 0) {
    return "The study has stored participant activity, but an approved plan is still required before new invites can be created.";
  }

  return "This study is ready for plan review. Generate or refine the interview plan before creating invites.";
}

function normalizeThemeLabels(themes: string[]) {
  return Array.from(
    new Set(
      themes
        .map((theme) => theme.trim())
        .filter(Boolean),
    ),
  );
}

function buildAggregateThemesFromDebriefs(debriefs: SessionDebrief[]) {
  const counts = new Map<string, number>();

  for (const debrief of debriefs) {
    for (const theme of debrief.summary.topThemes) {
      counts.set(theme.label, (counts.get(theme.label) ?? 0) + theme.score);
    }
  }

  return [...counts.entries()]
    .sort((left, right) => right[1] - left[1])
    .map(([label]) => label);
}

function buildTopicCoverageFallback(topics: string[], counts: Awaited<ReturnType<typeof countSessions>>) {
  return topics.map((topic, index) => ({
    id: `${topic.toLowerCase().replace(/\s+/g, "-")}-${index}`,
    topic,
    status: counts.completed > 0
      ? "pending-analysis"
      : counts.active > 0 && index === 0
        ? "in-progress"
        : "not-explored",
    evidence: counts.active > 0 && index === 0 ? 1 : 0,
  })) satisfies StudyDetail["topicCoverage"];
}

export async function refreshStudyStatus(
  db: DatabaseExecutor,
  studyId: string,
  updatedAt = nowIso(),
) {
  const study = await findStudyById(db, studyId);

  if (!study) {
    throw new ApiError(404, "Study not found.", "STUDY_NOT_FOUND");
  }

  if (study.status === "completed") {
    return "completed";
  }

  if (study.status === "archived") {
    return "archived";
  }

  const counts = await countSessions(db, studyId);
  const nextStatus = computeStudyStatus(study, counts);

  if (nextStatus !== study.status) {
    await updateStudyStatus(db, studyId, nextStatus, updatedAt);
  }

  return nextStatus;
}

export async function refreshStudyAggregate(db: DatabaseExecutor, studyId: string) {
  const study = await findStudyById(db, studyId);

  if (!study) {
    throw new ApiError(404, "Study not found.", "STUDY_NOT_FOUND");
  }

  const [aggregate, counts, approvedPlan, draftPlan, debriefs] = await Promise.all([
    findStudyAggregate(db, studyId),
    countSessions(db, studyId),
    findCurrentApprovedPlan(db, studyId),
    findCurrentDraftPlan(db, studyId),
    listDebriefReportsForStudy(db, studyId),
  ]);
  const plan = approvedPlan ?? draftPlan ?? {
    topics: await findStudyTopics(db, studyId),
  };
  const topics = normalizeTopics(plan.topics);
  const debriefModels = debriefs.map((report) => report.content);
  const topicCoverage =
    debriefModels.length > 0
      ? buildStudyTopicCoverageFromDebriefs(topics, debriefModels)
      : buildTopicCoverageFallback(topics, counts);
  const coveredWeight = topicCoverage.reduce((sum, item) => {
    if (item.status === "covered") {
      return sum + 1;
    }

    if (item.status === "in-progress") {
      return sum + 0.5;
    }

    if (item.status === "weak-evidence") {
      return sum + 0.25;
    }

    return sum;
  }, 0);
  const coverage =
    topicCoverage.length === 0 ? 0 : Math.round((coveredWeight / topicCoverage.length) * 100);
  const fallbackThemes =
    debriefModels.length > 0
      ? buildAggregateThemesFromDebriefs(debriefModels)
      : topics;
  const themes = normalizeThemeLabels(aggregate?.themes?.length ? aggregate.themes : fallbackThemes).slice(0, 3);
  const hiddenThemesCount = Math.max(
    normalizeThemeLabels(
      aggregate?.themes?.length ? aggregate.themes : fallbackThemes,
    ).length - themes.length,
    0,
  );
  const contradictionCount = debriefs.reduce(
    (sum, report) => sum + report.contradictions.length,
    0,
  );
  const signalCount = debriefs.filter((report) => report.emotionSignal !== "low").length;
  const status = computeStudyStatus(study, counts);
  const observation =
    aggregate?.observation && aggregate.observation.length > 0
      ? aggregate.observation
      : buildStudyObservation({
          completedSessions: counts.completed,
          hasApprovedPlan: Boolean(approvedPlan),
          liveSessions: counts.live,
          status,
          totalSessions: counts.total,
        });
  const updatedAt = nowIso();

  await upsertStudyAggregate(db, {
    studyId,
    coverage,
    contradictionCount,
    completedSessionCount: debriefs.length,
    signalCount,
    themes,
    hiddenThemesCount,
    topicCoverage,
    observation,
    updatedAt,
  });
}

export function computeAggregateCoverageValue(topicCoverage: StudyDetail["topicCoverage"]) {
  if (topicCoverage.length === 0) {
    return 0;
  }

  const weighted = topicCoverage.reduce((sum, item) => {
    if (item.status === "covered") {
      return sum + 1;
    }

    if (item.status === "in-progress") {
      return sum + 0.5;
    }

    if (item.status === "weak-evidence") {
      return sum + 0.25;
    }

    return sum;
  }, 0);

  return Math.round((weighted / topicCoverage.length) * 100);
}
