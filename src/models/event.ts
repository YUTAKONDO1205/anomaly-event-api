export type EventStatus = "NEW" | "CHECKING" | "RESOLVED";
export type EventSeverity = "LOW" | "MEDIUM" | "HIGH";

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
