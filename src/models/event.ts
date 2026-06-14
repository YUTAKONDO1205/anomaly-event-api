export type EventStatus = "NEW" | "CHECKING" | "RESOLVED";
export type EventSeverity = "LOW" | "MEDIUM" | "HIGH";

// Allowed status-lifecycle transitions. A status is never allowed to transition
// to itself (a same-status update is a no-op that would only bump updatedAt).
export const ALLOWED_STATUS_TRANSITIONS: Record<EventStatus, EventStatus[]> = {
  NEW: ["CHECKING", "RESOLVED"],
  CHECKING: ["NEW", "RESOLVED"],
  RESOLVED: ["CHECKING"]
};

export function isAllowedStatusTransition(from: EventStatus, to: EventStatus): boolean {
  return ALLOWED_STATUS_TRANSITIONS[from].includes(to);
}

export interface EventItem {
  eventId: string;
  deviceId: string;
  sectionId: string;
  distance: number;
  detectedAt: string;
  confidence: number;
  status: EventStatus;
  severity?: EventSeverity;
  detectionProvider?: string;
  topLabel?: string;
  evidenceSummary?: string;
  insightTags?: string[];
  imageKey?: string;
  note?: string;
  createdAt: string;
  updatedAt: string;
}

export interface CreateEventInput {
  deviceId: string;
  sectionId: string;
  distance: number;
  detectedAt: string;
  confidence: number;
  severity?: EventSeverity;
  detectionProvider?: string;
  topLabel?: string;
  evidenceSummary?: string;
  insightTags?: string[];
  imageKey?: string;
  note?: string;
}
