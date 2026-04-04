import { EventStatus } from "../models/event";

export interface UpdateStatusInput {
  status: EventStatus;
}

export interface ListEventsQuery {
  status?: EventStatus;
  deviceId?: string;
}

export type UploadContentType = "image/jpeg" | "image/png" | "image/webp";

export interface UploadUrlInput {
  contentType: UploadContentType;
}
