import { getStudyById } from "@/components/studies/studies.mock";

export type StudyMetricCard = {
  id: string;
  label: string;
  value: string;
  subtitle: string;
  progress?: number;
  progressLabel?: string;
  trendLabel?: string;
  tone: "primary" | "success" | "warning" | "violet";
};

export type StudyTopicCoverageItem = {
  id: string;
  topic: string;
  status: "covered" | "in-progress" | "weak-evidence" | "not-explored";
  evidence: number;
};

export type StudySessionItem = {
  id: string;
  participantLabel: string;
  participantInitials: string;
  state: "completed" | "in-progress";
  stateLabel: string;
  timingLabel: string;
  emotionalSignal: "high" | "medium" | "low";
  topicsCoveredLabel: string;
  topicsCoveredProgress: number;
  contradictionsCount: number;
  actionLabel: string;
  actionTone: "outline" | "primary";
};

export type StudyActivityItem = {
  id: string;
  type: "session-complete" | "signal" | "contradiction" | "coverage" | "session-start";
  title: string;
  detail?: string;
  timestamp: string;
};

export type StudyDetailModel = {
  studyId: string;
  title: string;
  description: string;
  statusLabel: string;
  metadata: {
    createdLabel: string;
    interviewDurationLabel: string;
    audienceLabel: string;
    interviewCountLabel: string;
  };
  metrics: StudyMetricCard[];
  insightThemes: string[];
  aiObservation: string;
  topicCoverage: StudyTopicCoverageItem[];
  sessions: StudySessionItem[];
  recentActivity: StudyActivityItem[];
};

const genZStudy = getStudyById("gen-z-budgeting");

const detailByStudyId: Record<string, StudyDetailModel> = genZStudy
  ? {
      "gen-z-budgeting": {
        studyId: genZStudy.id,
        title: genZStudy.title,
        description: genZStudy.description,
        statusLabel: genZStudy.statusLabel,
        metadata: {
          createdLabel: "Created 2 hours ago",
          interviewDurationLabel: "10 min interviews",
          audienceLabel: "Gen Z (18-25), US",
          interviewCountLabel: "10 interviews",
        },
        metrics: [
          {
            id: "interview-progress",
            label: "Interview Progress",
            value: "8 / 10",
            subtitle: "Interviews completed",
            progress: 80,
            progressLabel: "80%",
            tone: "primary",
          },
          {
            id: "topic-coverage",
            label: "Topic Coverage",
            value: "6 / 8",
            subtitle: "Research topics explored",
            progress: 75,
            progressLabel: "75%",
            tone: "success",
          },
          {
            id: "strong-signals",
            label: "Strong Signals",
            value: "12",
            subtitle: "Emotional moments detected",
            trendLabel: "3 new since last interview",
            tone: "warning",
          },
          {
            id: "contradictions",
            label: "Contradictions",
            value: "3",
            subtitle: "Contradictions surfaced",
            trendLabel: "1 new since last interview",
            tone: "violet",
          },
        ],
        insightThemes: [
          "Financial guilt",
          "Trust concerns",
          "Notification fatigue",
          "Low perceived progress",
        ],
        aiObservation:
          "Participants consistently describe budgeting as emotionally draining rather than practically difficult. Feelings of guilt, stress, and judgment are stronger drivers of drop-off than missing features or complexity.",
        topicCoverage: [
          {
            id: "first-impressions",
            topic: "First impressions & onboarding",
            status: "covered",
            evidence: 4,
          },
          {
            id: "expectations-vs-reality",
            topic: "Initial expectations vs. reality",
            status: "covered",
            evidence: 4,
          },
          {
            id: "emotional-experience",
            topic: "Emotional experiences over time",
            status: "covered",
            evidence: 4,
          },
          {
            id: "turning-points",
            topic: "Key turning points (when/why they stopped)",
            status: "in-progress",
            evidence: 3,
          },
          {
            id: "trust-privacy-security",
            topic: "Trust, privacy, and security concerns",
            status: "weak-evidence",
            evidence: 3,
          },
          {
            id: "helpful-app",
            topic: "What could have made the app more helpful",
            status: "not-explored",
            evidence: 2,
          },
          {
            id: "lack-of-value",
            topic: "Perceived lack of value over time",
            status: "not-explored",
            evidence: 2,
          },
          {
            id: "budgeting-relevance",
            topic: "Budgeting doesn't feel relevant",
            status: "not-explored",
            evidence: 1,
          },
        ],
        sessions: [
          {
            id: "participant-08",
            participantLabel: "Participant 08",
            participantInitials: "P8",
            state: "completed",
            stateLabel: "Completed",
            timingLabel: "45 min ago",
            emotionalSignal: "high",
            topicsCoveredLabel: "7 / 8",
            topicsCoveredProgress: 88,
            contradictionsCount: 1,
            actionLabel: "View Debrief",
            actionTone: "outline",
          },
          {
            id: "participant-09",
            participantLabel: "Participant 09",
            participantInitials: "P9",
            state: "in-progress",
            stateLabel: "In Progress",
            timingLabel: "07:32",
            emotionalSignal: "medium",
            topicsCoveredLabel: "5 / 8",
            topicsCoveredProgress: 63,
            contradictionsCount: 0,
            actionLabel: "Continue",
            actionTone: "primary",
          },
          {
            id: "participant-07",
            participantLabel: "Participant 07",
            participantInitials: "P7",
            state: "completed",
            stateLabel: "Completed",
            timingLabel: "1 hour ago",
            emotionalSignal: "high",
            topicsCoveredLabel: "8 / 8",
            topicsCoveredProgress: 100,
            contradictionsCount: 2,
            actionLabel: "View Debrief",
            actionTone: "outline",
          },
        ],
        recentActivity: [
          {
            id: "activity-1",
            type: "session-complete",
            title: "Participant 08 completed the interview",
            timestamp: "45 min ago",
          },
          {
            id: "activity-2",
            type: "signal",
            title: "Strong emotional signal detected",
            detail: "Topic: Financial guilt",
            timestamp: "46 min ago",
          },
          {
            id: "activity-3",
            type: "contradiction",
            title: "Contradiction detected in onboarding responses",
            timestamp: "1 hour ago",
          },
          {
            id: "activity-4",
            type: "coverage",
            title: "Topic coverage reached 75%",
            timestamp: "2 hours ago",
          },
          {
            id: "activity-5",
            type: "session-start",
            title: "Participant 09 interview started",
            timestamp: "2 hours ago",
          },
        ],
      },
    }
  : {};

export function getStudyDetailById(studyId: string) {
  return detailByStudyId[studyId];
}
