import assert from "node:assert/strict";
import test from "node:test";

import { validateStudyPlan } from "../lib/study-plan-validation.js";
import { validateGeneratedSessionDebriefOutput } from "../lib/session-debrief-validation.js";

import { buildDemoStudies } from "./demo-studies.js";

test("demo studies build complete, brand-focused fixtures across lifecycle states", () => {
  const studies = buildDemoStudies(new Date("2026-05-13T12:00:00.000Z"));

  assert.equal(studies.length, 5);
  assert.deepEqual(
    studies.map((study) => study.id).sort(),
    [
      "demo-beauty-packaging-unboxing",
      "demo-denim-fit-returns",
      "demo-protein-cereal-concept",
      "demo-skincare-repeat-purchase",
      "demo-sparkling-water-switching",
    ],
  );
  assert.deepEqual(
    Array.from(new Set(studies.map((study) => study.status))).sort(),
    ["analyzing", "completed", "interviewing", "planning"],
  );

  const planningStudy = studies.find((study) => study.id === "demo-protein-cereal-concept");
  assert.ok(planningStudy);
  assert.equal(planningStudy.sessionArtifacts.length, 0);
  assert.equal(planningStudy.debriefInserts.length, 0);
  assert.equal(planningStudy.aggregateInsert, null);
  assert.ok(planningStudy.studyInviteInsert);

  const interviewingStudy = studies.find((study) => study.id === "demo-skincare-repeat-purchase");
  assert.ok(interviewingStudy);
  assert.ok(interviewingStudy.sessionArtifacts.length > 0);
  assert.ok(
    interviewingStudy.sessionArtifacts.length < interviewingStudy.studyInsert.interviewsTarget,
  );
  assert.equal(
    interviewingStudy.debriefInserts.length,
    interviewingStudy.sessionArtifacts.length,
  );
  assert.ok(interviewingStudy.studyInviteInsert);

  const analyzingStudy = studies.find((study) => study.id === "demo-denim-fit-returns");
  assert.ok(analyzingStudy);
  assert.equal(
    analyzingStudy.sessionArtifacts.length,
    analyzingStudy.studyInsert.interviewsTarget,
  );
  assert.ok(analyzingStudy.debriefInserts.length < analyzingStudy.sessionArtifacts.length);
  assert.ok(analyzingStudy.aggregateInsert);
  assert.ok(
    (analyzingStudy.aggregateInsert?.completedSessionCount ?? 0) <
      analyzingStudy.sessionArtifacts.length,
  );
  assert.ok(analyzingStudy.studyInviteInsert);

  const completedStudies = studies.filter((study) => study.status === "completed");
  assert.equal(completedStudies.length, 2);
  for (const study of completedStudies) {
    assert.equal(study.studyInviteInsert, null);
  }

  for (const study of studies) {
    validateStudyPlan(study.planContent);
    assert.match(study.studyInsert.context, /\bour\b/i);
    assert.match(study.studyInsert.objective, /\bour\b/i);

    for (const session of study.sessionArtifacts) {
      assert.equal(session.sessionInsert.sessionStatus, "complete");
      assert.equal(session.profileInsert.consentAccepted, true);

      if (!session.debriefOutput || !session.debriefInsert) {
        continue;
      }

      validateGeneratedSessionDebriefOutput({
        output: session.debriefOutput,
        plan: study.planContent,
        transcript: session.transcriptRows,
      });
      assert.equal(
        session.debriefInsert.content.coverage.topics.length,
        study.planContent.topics.length,
      );
    }
  }

  for (const study of completedStudies) {
    assert.equal(study.debriefInserts.length, study.sessionArtifacts.length);
    assert.ok((study.aggregateInsert?.coverage ?? 0) >= 80);
    assert.ok((study.aggregateInsert?.themes ?? []).length >= 2);
  }

  const serialized = JSON.stringify(studies).toLowerCase();
  assert.equal(serialized.includes("budgeting"), false);
  assert.equal(serialized.includes("first-time managers"), false);
});
