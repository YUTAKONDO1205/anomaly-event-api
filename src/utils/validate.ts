import { CreateEventInput } from "../models/event";
import { EventStatus } from "../models/event";
import { ListEventsQuery, UpdateStatusInput, UploadContentType, UploadUrlInput } from "../types/event";
import { RequestValidationError } from "./errors";

export const allowedEventStatuses: EventStatus[] = ["NEW", "CHECKING", "RESOLVED"];
export const allowedUploadContentTypes: UploadContentType[] = ["image/jpeg", "image/png", "image/webp"];

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function isValidIsoDateTime(value: unknown): value is string {
  return typeof value === "string" && !Number.isNaN(Date.parse(value));
}

export function parseJson<T>(body: string | null | undefined): T | null {
  if (!body) return null;
  try {
    return JSON.parse(body) as T;
  } catch {
    throw new RequestValidationError("Request body must be valid JSON");
  }
}

export function validateCreateEventInput(input: Partial<CreateEventInput> | null): string[] {
  const errors: string[] = [];

  if (!input) {
    return ["Request body is required"];
  }

  if (!isNonEmptyString(input.deviceId)) {
    errors.push("deviceId must be a non-empty string");
  }

  if (!isNonEmptyString(input.sectionId)) {
    errors.push("sectionId must be a non-empty string");
  }

  if (!isFiniteNumber(input.distance) || input.distance < 0) {
    errors.push("distance must be a number greater than or equal to 0");
  }

  if (!isValidIsoDateTime(input.detectedAt)) {
    errors.push("detectedAt must be a valid ISO 8601 date-time string");
  }

  if (!isFiniteNumber(input.confidence) || input.confidence < 0 || input.confidence > 1) {
    errors.push("confidence must be a number between 0 and 1");
  }

  if (input.imageKey !== undefined && !isNonEmptyString(input.imageKey)) {
    errors.push("imageKey must be a non-empty string when provided");
  }

  if (input.note !== undefined && typeof input.note !== "string") {
    errors.push("note must be a string when provided");
  }

  return errors;
}

export function validateListEventsQuery(query: Partial<Record<keyof ListEventsQuery, unknown>>): string[] {
  const errors: string[] = [];

  if (query.status !== undefined && !allowedEventStatuses.includes(query.status as EventStatus)) {
    errors.push("status must be one of NEW, CHECKING, RESOLVED");
  }

  if (query.deviceId !== undefined && !isNonEmptyString(query.deviceId)) {
    errors.push("deviceId must be a non-empty string when provided");
  }

  return errors;
}

export function validateUpdateStatusInput(input: Partial<UpdateStatusInput> | null): string[] {
  const errors: string[] = [];

  if (!input) {
    return ["Request body is required"];
  }

  if (!allowedEventStatuses.includes(input.status as EventStatus)) {
    errors.push("status must be one of NEW, CHECKING, RESOLVED");
  }

  return errors;
}

export function validateUploadUrlInput(input: Partial<UploadUrlInput> | null): string[] {
  const errors: string[] = [];

  if (!input) {
    return ["Request body is required"];
  }

  if (!allowedUploadContentTypes.includes(input.contentType as UploadContentType)) {
    errors.push("contentType must be one of image/jpeg, image/png, image/webp");
  }

  return errors;
}
