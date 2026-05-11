import assert from "node:assert/strict";
import test from "node:test";

import { validateStudyPlan } from "../lib/study-plan-validation.js";
import { validateGeneratedSessionDebriefOutput } from "../lib/session-debrief-validation.js";

import { buildDemoStudies } from "./demo-studies.js";

test("demo studies build complete, internally consistent fixtures", () => {
  const studies = buildDemoStudies(new Date("2026-05-11T12:00:00.000Z"));

  assert.equal(studies.length, 2);
  assert.deepEqual(
    studies.map((study) => study.status),
    ["completed", "interviewing"],
  );

  for (const study of studies) {
    validateStudyPlan(study.planContent);
    assert.equal(study.sessionArtifacts.length, 3);
    assert.equal(study.debriefInserts.length, 3);
    assert.ok((study.aggregateInsert.coverage ?? 0) >= 80);
    assert.ok((study.aggregateInsert.themes ?? []).length >= 2);

    for (const session of study.sessionArtifacts) {
      validateGeneratedSessionDebriefOutput({
        output: session.debriefOutput,
        plan: study.planContent,
        transcript: session.transcriptRows,
      });
      assert.equal(session.debriefInsert.content.coverage.topics.length, study.planContent.topics.length);
      assert.equal(session.sessionInsert.sessionStatus, "complete");
      assert.equal(session.profileInsert.consentAccepted, true);
    }
  }
});
