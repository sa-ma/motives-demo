import type { StudyPlan } from "@motives-ai/contracts";

export type StudyPlanModel = StudyPlan;

export type EditableStudyPlanFields = Pick<
  StudyPlanModel,
  | "topics"
  | "mustCoverAreas"
  | "thingsToAvoid"
  | "selectedBehaviorId"
  | "selectedTone"
>;
