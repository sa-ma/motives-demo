export type InterviewDebriefEvidenceItem = {
  id: string;
  quote: string;
  timestamp: string;
  theme: string;
  label: string;
  whyItMatters: string;
  followUp: string;
};

export type InterviewDebriefSummary = {
  keyTakeaway: string;
  topThemes: Array<{
    label: string;
    strength: "high" | "medium" | "low";
    score: number;
  }>;
  evidenceIds: string[];
  recommendedFollowUp: string[];
  whyThisMatters: string;
};

export type InterviewDebriefTranscriptRow = {
  id: string;
  timestamp: string;
  speaker: "ai" | "participant";
  speakerLabel: string;
  text: string;
  evidenceId?: string;
};

export type InterviewDebriefCoverage = {
  researchObjective: string;
  topics: Array<{
    id: string;
    topic: string;
    status: "covered" | "in-progress" | "weak-evidence" | "not-explored";
    evidenceStrength: "high" | "medium" | "low" | "none";
    score: number;
  }>;
  missedAreas: string[];
  interviewQuality: {
    coverage: string;
    depth: string;
    participantEngagement: string;
  };
};

export type InterviewDebriefReasoningRow = {
  id: string;
  timestamp: string;
  trigger: string;
  aiDecision: string;
  researchPurpose: string;
  status: "completed" | "in-progress" | "planned";
};

export type InterviewDebriefModel = {
  studyId: string;
  sessionId: string;
  participantLabel: string;
  title: string;
  subtitle: string;
  summary: InterviewDebriefSummary;
  evidence: InterviewDebriefEvidenceItem[];
  transcript: InterviewDebriefTranscriptRow[];
  coverage: InterviewDebriefCoverage;
  reasoning: InterviewDebriefReasoningRow[];
};

const debriefs: InterviewDebriefModel[] = [
  {
    studyId: "gen-z-budgeting",
    sessionId: "participant-08",
    participantLabel: "Participant 08",
    title: "Interview Debrief",
    subtitle: "AI summarizes the interview",
    summary: {
      keyTakeaway:
        "The participant abandoned the budgeting app because it triggered guilt and financial stress. Over time, the app increased feelings of overwhelm and lack of progress, which reduced motivation to engage.",
      topThemes: [
        {
          label: "Emotional stress / guilt",
          strength: "high",
          score: 4,
        },
        {
          label: "Overwhelm",
          strength: "high",
          score: 3,
        },
        {
          label: "Low perceived progress",
          strength: "medium",
          score: 2,
        },
        {
          label: "Privacy concerns",
          strength: "low",
          score: 1,
        },
      ],
      evidenceIds: ["guilt-opening", "overwhelmed-review", "no-progress"],
      recommendedFollowUp: [
        "What would make financial tracking feel supportive instead of stressful?",
        "How can the app celebrate small wins better?",
        "What level of privacy and data control would increase your trust?",
        "What might bring you back to the app?",
      ],
      whyThisMatters:
        "Retention issues appear emotionally driven rather than caused by onboarding friction. Addressing guilt, overwhelm, and a sense of stagnation will be critical to improving long-term engagement.",
    },
    evidence: [
      {
        id: "guilt-opening",
        quote: "It started making me feel guilty every time I opened it.",
        timestamp: "05:42",
        theme: "Emotional stress / guilt",
        label: "Guilt",
        whyItMatters:
          "Reveals an emotional barrier that directly undermines engagement and retention.",
        followUp:
          "Probe whether guilt comes from spending visibility, negative tone, or lack of progress.",
      },
      {
        id: "overwhelmed-review",
        quote: "I'd look at the app and just feel overwhelmed.",
        timestamp: "12:18",
        theme: "Overwhelm",
        label: "Overwhelm",
        whyItMatters:
          "Suggests cognitive load or excessive complexity is creating avoidance behavior.",
        followUp:
          "Clarify whether overwhelm comes from too much data, too many tasks, or unclear prioritization.",
      },
      {
        id: "no-progress",
        quote: "I didn't feel like I was making any progress.",
        timestamp: "18:33",
        theme: "Low perceived progress",
        label: "Low perceived progress",
        whyItMatters:
          "Signals that value is not being reinforced over time, weakening habit formation.",
        followUp:
          "Ask what indicators or milestones would make progress feel visible and motivating.",
      },
    ],
    transcript: [
      {
        id: "t1",
        timestamp: "00:00",
        speaker: "ai",
        speakerLabel: "AI Interviewer",
        text: "Can you walk me through what led you to try this budgeting app?",
      },
      {
        id: "t2",
        timestamp: "00:15",
        speaker: "participant",
        speakerLabel: "Participant",
        text: "I wanted to get better with money and stop overspending.",
      },
      {
        id: "t3",
        timestamp: "01:02",
        speaker: "ai",
        speakerLabel: "AI Interviewer",
        text: "What was your experience like during the first few weeks?",
      },
      {
        id: "t4",
        timestamp: "01:20",
        speaker: "participant",
        speakerLabel: "Participant",
        text: "At first, it seemed helpful. I liked seeing where my money was going.",
      },
      {
        id: "t5",
        timestamp: "05:42",
        speaker: "participant",
        speakerLabel: "Participant",
        text: "It started making me feel guilty every time I opened it.",
        evidenceId: "guilt-opening",
      },
      {
        id: "t6",
        timestamp: "05:55",
        speaker: "ai",
        speakerLabel: "AI Interviewer",
        text: "What made you feel guilty?",
      },
      {
        id: "t7",
        timestamp: "06:18",
        speaker: "participant",
        speakerLabel: "Participant",
        text: "It showed me all the money I was wasting.",
      },
      {
        id: "t8",
        timestamp: "12:18",
        speaker: "participant",
        speakerLabel: "Participant",
        text: "I'd look at the app and just feel overwhelmed.",
        evidenceId: "overwhelmed-review",
      },
      {
        id: "t9",
        timestamp: "15:31",
        speaker: "ai",
        speakerLabel: "AI Interviewer",
        text: "Did the overwhelm come from the data itself or what the app expected you to do next?",
      },
      {
        id: "t10",
        timestamp: "18:33",
        speaker: "participant",
        speakerLabel: "Participant",
        text: "I didn't feel like I was making any progress.",
        evidenceId: "no-progress",
      },
      {
        id: "t11",
        timestamp: "17:50",
        speaker: "ai",
        speakerLabel: "AI Interviewer",
        text: "How did the app affect your trust in sharing financial information over time?",
      },
    ],
    coverage: {
      researchObjective:
        "Understand why users abandon the budgeting app and identify emotional and trust-related barriers to ongoing engagement.",
      topics: [
        {
          id: "onboarding",
          topic: "Onboarding experience",
          status: "covered",
          evidenceStrength: "high",
          score: 4,
        },
        {
          id: "emotional-drivers",
          topic: "Emotional drivers",
          status: "covered",
          evidenceStrength: "high",
          score: 4,
        },
        {
          id: "trust-security",
          topic: "Trust & security",
          status: "in-progress",
          evidenceStrength: "medium",
          score: 3,
        },
        {
          id: "retention-triggers",
          topic: "Retention triggers",
          status: "covered",
          evidenceStrength: "medium",
          score: 3,
        },
        {
          id: "pricing-value",
          topic: "Pricing / value",
          status: "weak-evidence",
          evidenceStrength: "low",
          score: 2,
        },
        {
          id: "feature-expectations",
          topic: "Feature expectations",
          status: "not-explored",
          evidenceStrength: "none",
          score: 0,
        },
      ],
      missedAreas: [
        "Specific pricing objections and willingness to pay",
        "Comparison with competing apps",
        "Desired features not currently offered",
      ],
      interviewQuality: {
        coverage: "7/10",
        depth: "8/10",
        participantEngagement: "High",
      },
    },
    reasoning: [
      {
        id: "r1",
        timestamp: "00:00",
        trigger: "Start of interview",
        aiDecision:
          "Asked opening question about initial decision point for the app.",
        researchPurpose:
          "Establish context and understand the participant's motivation.",
        status: "completed",
      },
      {
        id: "r2",
        timestamp: "05:42",
        trigger: 'Detected emotional language: "guilty"',
        aiDecision:
          "Probed to understand what caused the guilt and how the app contributed.",
        researchPurpose:
          "Identify emotional barriers that may drive abandonment.",
        status: "completed",
      },
      {
        id: "r3",
        timestamp: "12:18",
        trigger: 'Detected emotional language: "overwhelmed"',
        aiDecision:
          "Explored whether overwhelm came from data overload, complexity, or too many actions.",
        researchPurpose:
          "Determine the source of cognitive and emotional overload.",
        status: "completed",
      },
      {
        id: "r4",
        timestamp: "15:31",
        trigger: "Exploring root cause of guilt",
        aiDecision:
          "Asked whether guilt came from spending visibility or lack of progress.",
        researchPurpose:
          "Pinpoint the primary driver to inform product and messaging direction.",
        status: "in-progress",
      },
      {
        id: "r5",
        timestamp: "17:50",
        trigger: "Trust & security topic underexplored",
        aiDecision:
          "Planned to steer toward data privacy and trust in the next section.",
        researchPurpose:
          "Ensure trust is evaluated as a potential barrier to long-term use.",
        status: "planned",
      },
    ],
  },
];

export function getInterviewDebriefById(studyId: string, sessionId: string) {
  return debriefs.find(
    (debrief) =>
      debrief.studyId === studyId && debrief.sessionId === sessionId,
  );
}
