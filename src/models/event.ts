export type EventStatus = "NEW" | "CHECKING" | "RESOLVED";

export interface EventItem {
  eventId: string;
  deviceId: string;
  sectionId: string;
  distance: number;
  detectedAt: string;
  confidence: number;
  status: EventStatus;
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
  imageKey?: string;
  note?: string;
}
