import type { StudyPlan } from "@motives-ai/contracts";

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

export function estimateInterviewDurationMinutes(
  plan: Pick<
    StudyPlan,
    "topics" | "exampleProbes" | "mustCoverAreas" | "probingStrategy"
  >,
) {
  const topicWeight = plan.topics.length * 1.75;
  const probeWeight = plan.exampleProbes.length * 0.5;
  const coverageWeight = plan.mustCoverAreas.length * 0.3;
  const strategyWeight = Math.min(plan.probingStrategy.length, 4) * 0.2;
  const rawMinutes = 3 + topicWeight + probeWeight + coverageWeight + strategyWeight;

  return clamp(Math.round(rawMinutes / 5) * 5, 10, 35);
}

export function formatEstimatedInterviewDuration(minutes: number) {
  return `~${minutes} min`;
}

export function hydrateStudyPlanDerivedFields(plan: StudyPlan): StudyPlan {
  const estimatedDurationMinutes =
    typeof plan.estimatedDurationMinutes === "number" &&
    Number.isFinite(plan.estimatedDurationMinutes)
      ? clamp(Math.round(plan.estimatedDurationMinutes), 1, 120)
      : estimateInterviewDurationMinutes(plan);

  return {
    ...plan,
    estimatedDurationLabel:
      plan.estimatedDurationLabel?.trim() ||
      formatEstimatedInterviewDuration(estimatedDurationMinutes),
    estimatedDurationMinutes,
  };
}
