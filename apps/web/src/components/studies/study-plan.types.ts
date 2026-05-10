import type { StudyPlan } from "@motives-ai/contracts";

export type EditableStudyPlanFields = Pick<
  StudyPlan,
  | "topics"
  | "mustCoverAreas"
  | "thingsToAvoid"
  | "selectedBehaviorId"
  | "selectedTone"
>;
