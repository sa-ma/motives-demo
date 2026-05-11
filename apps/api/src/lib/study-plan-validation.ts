import type { StudyPlan } from "@motives-ai/contracts";

import type { GeneratedStudyPlanOutput } from "../ai/research-schemas.js";

const PLAN_FIELD_NAMES = [
  "objective",
  "hypotheses",
  "topics",
  "openingQuestion",
  "probingStrategy",
  "exampleProbes",
  "mustCoverAreas",
  "thingsToAvoid",
  "selectedBehaviorId",
  "selectedTone",
] as const;

const PLAN_FIELD_PATTERN = new RegExp(
  `"?(?:${PLAN_FIELD_NAMES.join("|")})"?\\s*:`,
  "i",
);

const LEAK_PATTERNS = [
  PLAN_FIELD_PATTERN,
  /assistant\s+to=/i,
  /##assistant/i,
  /response_json/i,
  /need valid json/i,
  /let'?s send fixed json/i,
  /code[_ -]?block/i,
  /```/,
  /\bfield names?\b/i,
  /\bstring values?\b/i,
  /\bstructured data\b/i,
  /\bmatches? the schema\b/i,
  /\brepair notes?\b/i,
  /\bformatting mistake\b/i,
] as const;

type PlanListField =
  | "hypotheses"
  | "topics"
  | "probingStrategy"
  | "exampleProbes"
  | "mustCoverAreas"
  | "thingsToAvoid";

type PlanListConfig = {
  maxItems: number;
  maxLength: number;
  minItems: number;
  requireQuestion?: boolean;
};

const PLAN_LIST_CONFIG: Record<PlanListField, PlanListConfig> = {
  hypotheses: {
    maxItems: 6,
    maxLength: 160,
    minItems: 4,
  },
  topics: {
    maxItems: 8,
    maxLength: 80,
    minItems: 5,
  },
  probingStrategy: {
    maxItems: 6,
    maxLength: 160,
    minItems: 4,
  },
  exampleProbes: {
    maxItems: 8,
    maxLength: 220,
    minItems: 5,
    requireQuestion: true,
  },
  mustCoverAreas: {
    maxItems: 8,
    maxLength: 160,
    minItems: 5,
  },
  thingsToAvoid: {
    maxItems: 6,
    maxLength: 160,
    minItems: 4,
  },
};

function normalizeWhitespace(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

function containsSuspiciousPlanText(value: string) {
  return (
    LEAK_PATTERNS.some((pattern) => pattern.test(value)) ||
    /[{}[\]]/.test(value) ||
    /"\s*,\s*"/.test(value) ||
    /\\"\s*,\s*\\"/.test(value)
  );
}

function countQuestionMarks(value: string) {
  return (value.match(/\?/g) ?? []).length;
}

function validatePlanText(
  value: string,
  options: {
    field: string;
    maxLength: number;
    requireQuestion?: boolean;
  },
) {
  const normalized = normalizeWhitespace(value);

  if (!normalized) {
    throw new InvalidGeneratedStudyPlanError(
      `Generated plan field "${options.field}" was empty.`,
    );
  }

  if (normalized.length > options.maxLength) {
    throw new InvalidGeneratedStudyPlanError(
      `Generated plan field "${options.field}" exceeded the allowed length.`,
    );
  }

  if (containsSuspiciousPlanText(normalized)) {
    throw new InvalidGeneratedStudyPlanError(
      `Generated plan field "${options.field}" contained malformed content.`,
    );
  }

  if (!options.requireQuestion && normalized.includes("?")) {
    throw new InvalidGeneratedStudyPlanError(
      `Generated plan field "${options.field}" contained question-like or meta content.`,
    );
  }

  if (options.requireQuestion && !normalized.endsWith("?")) {
    throw new InvalidGeneratedStudyPlanError(
      `Generated plan field "${options.field}" must be a single question.`,
    );
  }

  if (options.requireQuestion && countQuestionMarks(normalized) !== 1) {
    throw new InvalidGeneratedStudyPlanError(
      `Generated plan field "${options.field}" must contain exactly one question.`,
    );
  }

  return normalized;
}

function validatePlanList(field: PlanListField, values: string[]) {
  const config = PLAN_LIST_CONFIG[field];
  const seen = new Set<string>();

  if (values.length < config.minItems || values.length > config.maxItems) {
    throw new InvalidGeneratedStudyPlanError(
      `Generated plan field "${field}" had an invalid number of items.`,
    );
  }

  return values.map((value) => {
    const normalized = validatePlanText(value, {
      field,
      maxLength: config.maxLength,
      requireQuestion: config.requireQuestion,
    });
    const normalizedKey = normalized.toLowerCase();

    if (seen.has(normalizedKey)) {
      throw new InvalidGeneratedStudyPlanError(
        `Generated plan field "${field}" contained duplicate items.`,
      );
    }

    seen.add(normalizedKey);
    return normalized;
  });
}

export class InvalidGeneratedStudyPlanError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidGeneratedStudyPlanError";
  }
}

export function validateGeneratedStudyPlanOutput(
  output: GeneratedStudyPlanOutput,
): GeneratedStudyPlanOutput {
  return {
    objective: validatePlanText(output.objective, {
      field: "objective",
      maxLength: 240,
    }),
    hypotheses: validatePlanList("hypotheses", output.hypotheses),
    topics: validatePlanList("topics", output.topics),
    openingQuestion: validatePlanText(output.openingQuestion, {
      field: "openingQuestion",
      maxLength: 220,
      requireQuestion: true,
    }),
    probingStrategy: validatePlanList("probingStrategy", output.probingStrategy),
    exampleProbes: validatePlanList("exampleProbes", output.exampleProbes),
    mustCoverAreas: validatePlanList("mustCoverAreas", output.mustCoverAreas),
    thingsToAvoid: validatePlanList("thingsToAvoid", output.thingsToAvoid),
    selectedBehaviorId: output.selectedBehaviorId,
    selectedTone: validatePlanText(output.selectedTone, {
      field: "selectedTone",
      maxLength: 60,
    }),
  };
}

export function validateStudyPlan(plan: StudyPlan) {
  validateGeneratedStudyPlanOutput({
    objective: plan.objective,
    hypotheses: plan.hypotheses,
    topics: plan.topics,
    openingQuestion: plan.openingQuestion,
    probingStrategy: plan.probingStrategy,
    exampleProbes: plan.exampleProbes,
    mustCoverAreas: plan.mustCoverAreas,
    thingsToAvoid: plan.thingsToAvoid,
    selectedBehaviorId: plan.selectedBehaviorId,
    selectedTone: plan.selectedTone,
  });
}
