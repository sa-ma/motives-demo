export type StudySummaryAccent =
  | "interviewing"
  | "planning"
  | "analyzing"
  | "completed";

export type StudySummaryCardModel = {
  id: string;
  title: string;
  description: string;
  status: string;
  statusLabel: string;
  interviewsCompleted: number;
  interviewsTarget: number;
  coverage: number;
  signalCount: number;
  themeLabel: string;
  themes: string[];
  hiddenThemesCount?: number;
  observation: string;
  updatedLabel: string;
  actionLabel: string;
  accent: StudySummaryAccent;
};

const seededStudies: StudySummaryCardModel[] = [
  {
    id: "gen-z-budgeting",
    title: "Why do Gen Z users abandon budgeting apps?",
    description:
      "Understand the emotional and practical reasons Gen Z users stop using budgeting apps after onboarding.",
    status: "Interviewing",
    statusLabel: "Interviewing",
    interviewsCompleted: 8,
    interviewsTarget: 10,
    coverage: 72,
    signalCount: 3,
    themeLabel: "Emerging themes",
    themes: ["Emotional stress", "Guilt & shame", "Security concerns"],
    hiddenThemesCount: 2,
    observation:
      "Participants consistently describe budgeting as emotionally draining more than practically difficult.",
    updatedLabel: "Updated 12 mins ago",
    actionLabel: "Continue Study",
    accent: "interviewing",
  },
  {
    id: "fintech-trust",
    title: "Trust drivers in fintech onboarding",
    description:
      "Explore what builds or breaks trust during the first-time onboarding experience in fintech apps.",
    status: "Planning",
    statusLabel: "Planning",
    interviewsCompleted: 0,
    interviewsTarget: 10,
    coverage: 0,
    signalCount: 0,
    themeLabel: "Planned topics",
    themes: ["Trust & security", "Data privacy", "Transparency"],
    hiddenThemesCount: 3,
    observation:
      "This study is ready to start. The AI has prepared an interview plan with key hypotheses and probing strategy.",
    updatedLabel: "Updated 2 hours ago",
    actionLabel: "Review Plan",
    accent: "planning",
  },
  {
    id: "productivity-features",
    title: "Feature preferences in productivity apps",
    description:
      "Identify the most valued features and workflows that drive long-term usage and satisfaction.",
    status: "Analyzing",
    statusLabel: "Analyzing",
    interviewsCompleted: 5,
    interviewsTarget: 8,
    coverage: 48,
    signalCount: 2,
    themeLabel: "Emerging themes",
    themes: ["Time savings", "Simplicity", "Integrations"],
    hiddenThemesCount: 1,
    observation:
      "Participants love features that save time, but drop off when the app feels cluttered or overwhelming.",
    updatedLabel: "Updated 1 day ago",
    actionLabel: "Continue Study",
    accent: "analyzing",
  },
  {
    id: "notification-fatigue",
    title: "Notification fatigue in social apps",
    description:
      "Understand how notifications impact user well-being, engagement, and long-term retention.",
    status: "Completed",
    statusLabel: "Completed",
    interviewsCompleted: 10,
    interviewsTarget: 10,
    coverage: 100,
    signalCount: 5,
    themeLabel: "Top themes",
    themes: ["Overwhelm", "Constant interruptions", "Emotional drain"],
    hiddenThemesCount: 2,
    observation:
      "Notifications are a major source of stress and distraction, leading to reduced engagement and eventual disengagement.",
    updatedLabel: "Completed 2 days ago",
    actionLabel: "View Debrief",
    accent: "completed",
  },
];

export const studies = seededStudies;
