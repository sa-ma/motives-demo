import type {
  InterviewInvitePayload,
  InterviewMessage,
  InterviewProgressState,
  InterviewSessionStatus,
  InterviewStep,
  InterviewUIMessage,
  ParticipantIntakeField,
} from "@/lib/interviews/types";

type InterviewInviteDefinition = Omit<
  InterviewInvitePayload,
  "inviteCode" | "sessionStatus"
> & {
  defaultSessionStatus: InterviewSessionStatus;
  inviteCode: string;
};

const participantFields: ParticipantIntakeField[] = [
  {
    id: "preferredName",
    label: "Preferred name",
    placeholder: "e.g. Alex",
    required: true,
    type: "text",
  },
  {
    id: "ageRange",
    label: "Age range",
    options: [
      { label: "18-24", value: "18-24" },
      { label: "25-34", value: "25-34" },
      { label: "35-44", value: "35-44" },
      { label: "45+", value: "45+" },
    ],
    placeholder: "Select your range",
    required: true,
    type: "select",
  },
  {
    id: "country",
    label: "Country",
    options: [
      { label: "United States", value: "US" },
      { label: "Canada", value: "CA" },
      { label: "United Kingdom", value: "GB" },
      { label: "Australia", value: "AU" },
    ],
    placeholder: "Select your country",
    required: true,
    type: "select",
  },
  {
    id: "usedBudgetingAppRecently",
    label: "Have you used a budgeting app in the last 6 months?",
    options: [
      { label: "Yes", value: "yes" },
      { label: "No", value: "no" },
    ],
    required: true,
    type: "radio",
  },
];

const interviewInvites: Record<string, InterviewInviteDefinition> = {
  ABC123: {
    consentCopy:
      "I understand this is an AI-led research interview and my responses may be analyzed for research purposes.",
    defaultSessionStatus: "welcome",
    estimatedDuration: "10-12 min",
    formatLabel: "Conversational interview",
    introCopy:
      "You’re invited to take part in an AI-led research interview. The interviewer will ask about your experiences and opinions, and you can skip any question at any time.",
    inviteCode: "ABC123",
    participantFields,
    studyTitle: "Research Interview",
    topicLabels: [
      "Onboarding experience",
      "Core budgeting habits",
      "Value and trust signals",
      "Retention triggers",
    ],
  },
  DONE123: {
    consentCopy:
      "I understand this is an AI-led research interview and my responses may be analyzed for research purposes.",
    defaultSessionStatus: "complete",
    estimatedDuration: "10-12 min",
    formatLabel: "Conversational interview",
    introCopy:
      "This invite already has a completed session, useful for checking the final state and redirects.",
    inviteCode: "DONE123",
    participantFields,
    studyTitle: "Research Interview",
    topicLabels: [
      "Onboarding experience",
      "Core budgeting habits",
      "Value and trust signals",
      "Retention triggers",
    ],
  },
  EXPIRED123: {
    consentCopy:
      "I understand this is an AI-led research interview and my responses may be analyzed for research purposes.",
    defaultSessionStatus: "expired",
    estimatedDuration: "10-12 min",
    formatLabel: "Conversational interview",
    introCopy:
      "This invite is intentionally expired so the app can show the public error treatment.",
    inviteCode: "EXPIRED123",
    participantFields,
    studyTitle: "Research Interview",
    topicLabels: [
      "Onboarding experience",
      "Core budgeting habits",
      "Value and trust signals",
      "Retention triggers",
    ],
  },
};

const seededTranscript: InterviewMessage[] = [
  {
    id: "assistant-intro",
    role: "assistant",
    text: "Thanks for joining today. To start, can you tell me what made you decide to try a budgeting app?",
    timestampLabel: "10:21 AM",
  },
];

const followUpQuestions = [
  "What features do you find most helpful when you are trying to stay on top of your spending?",
  "How often do you check the app, and what usually prompts you to open it?",
  "Can you describe a recent moment when the app felt especially useful or frustrating?",
  "If you could change one thing about the experience, what would it be?",
];

const acknowledgements = [
  "That makes sense.",
  "That is helpful context.",
  "I appreciate the detail.",
  "That is a useful contrast.",
];

export function getInterviewInviteDefinition(inviteCode: string) {
  return interviewInvites[inviteCode.toUpperCase()] ?? null;
}

export function buildInterviewInvitePayload(
  inviteCode: string,
  sessionStatus: InterviewSessionStatus,
): InterviewInvitePayload | null {
  const invite = getInterviewInviteDefinition(inviteCode);

  if (!invite) {
    return null;
  }

  return {
    consentCopy: invite.consentCopy,
    estimatedDuration: invite.estimatedDuration,
    formatLabel: invite.formatLabel,
    introCopy: invite.introCopy,
    inviteCode: invite.inviteCode,
    participantFields: invite.participantFields,
    sessionStatus,
    studyTitle: invite.studyTitle,
    topicLabels: invite.topicLabels,
  };
}

export function getDefaultInterviewSessionStatus(inviteCode: string) {
  return getInterviewInviteDefinition(inviteCode)?.defaultSessionStatus ?? null;
}

export function getInterviewPath(
  inviteCode: string,
  step: InterviewSessionStatus | InterviewStep,
) {
  return `/interviews/${inviteCode}/${step}`;
}

export function getRedirectPathForStep(
  inviteCode: string,
  currentStatus: InterviewSessionStatus,
  requestedStep: InterviewStep,
) {
  if (currentStatus === "expired") {
    return null;
  }

  if (currentStatus === requestedStep) {
    return null;
  }

  return getInterviewPath(inviteCode, currentStatus);
}

export function buildInitialTranscript() {
  return seededTranscript;
}

export function buildInterviewProgressState(
  topicLabels: string[],
  answerCount: number,
): InterviewProgressState {
  const clampedCount = Math.max(0, answerCount);
  const coveredCount =
    clampedCount <= 1 ? 0 : Math.min(clampedCount - 1, topicLabels.length);
  const activeIndex =
    coveredCount >= topicLabels.length ? null : coveredCount;

  return {
    activeTopicLabel:
      activeIndex === null ? null : topicLabels[activeIndex] ?? null,
    completionRatio:
      topicLabels.length === 0
        ? 0
        : Math.min((coveredCount + (activeIndex !== null ? 0.5 : 1)) / topicLabels.length, 1),
    coveredTopicLabels: topicLabels.slice(0, coveredCount),
    remainingTopicLabels:
      activeIndex === null ? [] : topicLabels.slice(activeIndex + 1),
  };
}

export function toInterviewUIMessage(
  message: InterviewMessage,
): InterviewUIMessage {
  return {
    id: message.id,
    metadata: {
      timestampLabel: message.timestampLabel,
    },
    parts: [
      {
        state: "done",
        text: message.text,
        type: "text",
      },
    ],
    role: message.role,
  };
}

export function buildAssistantReply(options: {
  answerCount: number;
  event?: string;
  lastUserText: string;
  preferredName?: string;
}) {
  const { answerCount, event, lastUserText, preferredName } = options;
  const normalizedText = lastUserText.trim();
  const namePrefix = preferredName ? `${preferredName}, ` : "";

  if (event === "skip-question") {
    const nextQuestion =
      followUpQuestions[Math.min(answerCount, followUpQuestions.length - 1)] ??
      "Thanks. Before we wrap up, what is the biggest improvement you would want from this product?";

    return `No problem, we can skip that. ${namePrefix}${nextQuestion}`;
  }

  if (answerCount > followUpQuestions.length) {
    return `${acknowledgements[(answerCount - 1) % acknowledgements.length]} ${namePrefix}that gives me enough context to summarize your experience. Use the End interview action when you are ready to finish.`;
  }

  const acknowledgement =
    acknowledgements[(answerCount - 1) % acknowledgements.length];
  const nextQuestion = followUpQuestions[answerCount - 1];

  if (!nextQuestion) {
    return `${acknowledgements[(answerCount - 1) % acknowledgements.length]} ${namePrefix}that gives me enough context to summarize your experience. Use the End interview action when you are ready to finish.`;
  }

  if (normalizedText.length < 18) {
    return `${acknowledgement} ${namePrefix}Could you say a bit more? ${nextQuestion}`;
  }

  return `${acknowledgement} ${namePrefix}${nextQuestion}`;
}
