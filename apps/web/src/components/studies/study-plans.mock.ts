import { studies } from "@/components/studies/studies.mock";

export type StudyPlanModel = {
  studyId: string;
  title: string;
  subtitle: string;
  objective: string;
  hypotheses: string[];
  topics: string[];
  openingQuestion: string;
  probingStrategy: string[];
  exampleProbes: string[];
  mustCoverAreas: string[];
  thingsToAvoid: string[];
  selectedBehaviorId:
    | "probe-emotional-language"
    | "ask-for-examples"
    | "challenge-contradictions"
    | "stay-neutral"
    | "avoid-leading-questions";
  selectedTone: string;
};

export type EditableStudyPlanFields = Pick<
  StudyPlanModel,
  | "topics"
  | "mustCoverAreas"
  | "thingsToAvoid"
  | "selectedBehaviorId"
  | "selectedTone"
>;

const planByStudyId: Record<string, StudyPlanModel> = {
  "gen-z-budgeting": {
    studyId: "gen-z-budgeting",
    title: studies[0].title,
    subtitle: "AI-generated plan tailored to your research objective",
    objective:
      "Understand the key reasons Gen Z users abandon budgeting apps after onboarding, with a focus on emotional triggers, experience friction, and perceived value over time.",
    hypotheses: [
      "Users feel overwhelmed or judged by the budgeting process.",
      "Budgeting does not feel relevant once the app leaves onboarding.",
      "Trust breaks when financial accuracy or security feels uncertain.",
      "The long-term value of the app becomes unclear after first use.",
    ],
    topics: [
      "First impressions and onboarding experience",
      "Initial expectations vs. lived experience",
      "Emotional response to budgeting over time",
      "Moments that led to disengagement or drop-off",
      "Trust, privacy, and security concerns",
      "What would have made the app worth returning to",
    ],
    openingQuestion:
      "Can you walk me through the last budgeting app you used and what made you decide to try it in the first place?",
    probingStrategy: [
      "Ask for specific examples, moments, and behaviors.",
      "Probe emotional language when participants describe friction.",
      "Follow up on contradictions between intent and action.",
      "Explore the participant's 'why' at least twice before moving on.",
    ],
    exampleProbes: [
      "What was going through your mind at that moment?",
      "How did that experience make you feel?",
      "Can you walk me through what happened next?",
      "Why do you think that part felt frustrating?",
    ],
    mustCoverAreas: [
      "Budgeting doesn't feel relevant later in life",
      "Lack of trust in data accuracy",
      "Perceived lack of value over time",
    ],
    thingsToAvoid: [
      "Leading questions",
      "Asking about competitors",
      "Technical feature details",
    ],
    selectedBehaviorId: "probe-emotional-language",
    selectedTone: "Conversational and empathetic",
  },
  "fintech-trust": {
    studyId: "fintech-trust",
    title: studies[1].title,
    subtitle: "AI-generated plan tailored to your research objective",
    objective:
      "Explore what signals build or erode trust during fintech onboarding, especially around identity verification, permission requests, and the first moments of product value.",
    hypotheses: [
      "Users decide whether an app feels trustworthy within the first few onboarding steps.",
      "Permission requests without clear explanation create immediate skepticism.",
      "Trust increases when users understand how data will be used and protected.",
      "A fast path to visible value offsets some onboarding friction.",
    ],
    topics: [
      "First impression of the product and brand",
      "Reactions to identity checks and permission requests",
      "Moments that increased or reduced confidence",
      "Clarity of messaging around privacy and security",
      "Comparison to other fintech onboarding experiences",
      "Signals that would make the experience feel more trustworthy",
    ],
    openingQuestion:
      "Tell me about the last time you signed up for a fintech app and the moment you decided it felt safe enough to continue.",
    probingStrategy: [
      "Anchor responses to concrete screens or steps in the flow.",
      "Probe what each trust signal meant to the participant.",
      "Ask participants to compare expectation versus reality.",
      "Double-click on hesitation before and after sensitive requests.",
    ],
    exampleProbes: [
      "What specifically made that step feel safe or unsafe?",
      "Did anything surprise you in that flow?",
      "What information were you missing at that point?",
      "If you had stopped there, what would the reason have been?",
    ],
    mustCoverAreas: [
      "Permission requests without context",
      "How trust changes after verification",
      "Perceived value during onboarding",
    ],
    thingsToAvoid: [
      "Leading questions",
      "Overly hypothetical scenarios",
      "Deep technical architecture",
    ],
    selectedBehaviorId: "ask-for-examples",
    selectedTone: "Conversational and empathetic",
  },
};

export function getStudyPlanById(studyId: string) {
  return planByStudyId[studyId];
}
