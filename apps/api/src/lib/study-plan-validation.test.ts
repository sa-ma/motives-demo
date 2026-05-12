import assert from "node:assert/strict";
import test from "node:test";

import type { GeneratedStudyPlanOutput } from "../ai/research-schemas.js";
import {
  InvalidGeneratedStudyPlanError,
  validateGeneratedStudyPlanOutput,
  validateStudyPlan,
} from "./study-plan-validation.js";

function createValidOutput(): GeneratedStudyPlanOutput {
  return {
    objective: "Understand why Gen Z users abandon budgeting apps shortly after onboarding.",
    hypotheses: [
      "Participants lose momentum when setup feels high-effort.",
      "Early trust concerns reduce willingness to link financial accounts.",
      "First-week value is not clear enough to justify return visits.",
      "Upkeep feels too manual once the first-wave curiosity wears off.",
    ],
    topics: [
      "Onboarding",
      "Trust",
      "Retention",
      "Perceived value",
      "Upkeep effort",
    ],
    openingQuestion:
      "Can you walk me through what you expected this budgeting app to help you do when you first tried it?",
    probingStrategy: [
      "Ask for a specific moment instead of general opinions.",
      "Separate setup friction from trust concerns.",
      "Use contrast questions to surface what changed over time.",
      "Compare what felt promising early on versus what felt disappointing later.",
    ],
    exampleProbes: [
      "What were you hoping the app would help you do when you first downloaded it?",
      "What happened during setup or onboarding that felt easy, confusing, annoying, or not worth it?",
      "At what point did your excitement or interest change, if it did?",
      "How did the app make you feel about your money situation in those first few days?",
      "Was there a specific moment when you thought you probably were not going to keep using it?",
      "What about keeping the app updated started to feel harder than it was worth?",
    ],
    mustCoverAreas: [
      "Their motivation for trying the app in the first place.",
      "The onboarding steps they completed before regular use began.",
      "The first sign that enthusiasm dropped after onboarding.",
      "The practical friction that made continued use harder than expected.",
      "The point where they stopped returning and why.",
    ],
    thingsToAvoid: [
      "Do not lead participants toward privacy concerns if they do not raise them.",
      "Do not ask them to evaluate features they never used.",
      "Do not frame abandonment as failure or lack of discipline.",
      "Do not drift into generic budgeting advice unrelated to app use.",
    ],
    selectedBehaviorId: "ask-for-examples",
    selectedTone: "calm, direct",
  };
}

test("validateGeneratedStudyPlanOutput accepts a clean plan", () => {
  const validated = validateGeneratedStudyPlanOutput(createValidOutput());

  assert.equal(
    validated.openingQuestion,
    "Can you walk me through what you expected this budgeting app to help you do when you first tried it?",
  );
});

test("validateGeneratedStudyPlanOutput rejects leaked json in example probes", () => {
  const corruptedOutput = createValidOutput();

  corruptedOutput.exampleProbes = [
    ...corruptedOutput.exampleProbes.slice(0, 5),
    `How well did the app's budget categories, goals, or advice fit how you actually manage money?","What, if anything, felt too manual or time-consuming after the initial setup?","How comfortable were you linking your accounts, and what concerns did you have, if any?","Did anything about the balances, transactions, or recommendations make you question whether the app was reliable?","What would the app have needed to do in the first week for you to keep using it?"],"mustCoverAreas":["Which app they used most recently and how long they used it after onboarding."],"thingsToAvoid":["Do not ask generic questions about budgeting habits unless directly tied to app abandonment."],"selectedBehaviorId":"ask-for-examples","selectedTone":"calm, direct"}##assistant to=final response_json`,
  ];

  assert.throws(
    () => validateGeneratedStudyPlanOutput(corruptedOutput),
    InvalidGeneratedStudyPlanError,
  );
});

test("validateGeneratedStudyPlanOutput rejects multi-question example probes", () => {
  const corruptedOutput = createValidOutput();

  corruptedOutput.exampleProbes[0] =
    "What made you download the app? What were you hoping it would solve?";

  assert.throws(
    () => validateGeneratedStudyPlanOutput(corruptedOutput),
    InvalidGeneratedStudyPlanError,
  );
});

test("validateGeneratedStudyPlanOutput rejects question-like chatter in hypotheses", () => {
  const corruptedOutput = createValidOutput();

  corruptedOutput.hypotheses[1] =
    "hypotheses? no field names in string values violated? fine.";

  assert.throws(
    () => validateGeneratedStudyPlanOutput(corruptedOutput),
    InvalidGeneratedStudyPlanError,
  );
});
