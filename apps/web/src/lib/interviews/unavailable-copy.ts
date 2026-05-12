import type { InterviewRouteState } from "@/lib/interviews/types";

type UnavailableInterviewReason = Extract<
  InterviewRouteState,
  { kind: "unavailable" }
>["reason"];

export function getUnavailableCopy(reason: UnavailableInterviewReason) {
  switch (reason) {
    case "active-cap-reached":
      return "All interview slots are currently occupied. Please try again later.";
    case "study-closed":
      return "This study is no longer accepting new interviews.";
    case "target-reached":
      return "The target number of completed interviews has already been reached.";
  }

  throw new Error("Unhandled unavailable interview reason.");
}
