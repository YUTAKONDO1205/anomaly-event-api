import { v4 as uuidv4 } from "uuid";
import {
  CreateEventInput,
  EventItem,
  EventStatus,
  isAllowedStatusTransition
} from "../models/event";
import { EventRepository } from "../repositories/eventRepository";
import { ListEventsQuery } from "../types/event";
import { InvalidStatusTransitionError } from "../utils/errors";

export class EventService {
  constructor(private readonly repository = new EventRepository()) {}

  async createEvent(input: CreateEventInput): Promise<EventItem> {
    const now = new Date().toISOString();
    const item: EventItem = {
      eventId: uuidv4(),
      deviceId: input.deviceId,
      sectionId: input.sectionId,
      distance: input.distance,
      detectedAt: input.detectedAt,
      confidence: input.confidence,
      severity: input.severity,
      detectionProvider: input.detectionProvider,
      topLabel: input.topLabel,
      evidenceSummary: input.evidenceSummary,
      insightTags: input.insightTags,
      imageKey: input.imageKey,
      note: input.note,
      status: "NEW",
      createdAt: now,
      updatedAt: now
    };

    await this.repository.save(item);
    return item;
  }

  async getEvents(filters: ListEventsQuery = {}): Promise<EventItem[]> {
    const items = await this.repository.findAll(filters);
    return items.sort((a, b) => b.detectedAt.localeCompare(a.detectedAt));
  }

  async getEventById(eventId: string): Promise<EventItem | null> {
    return this.repository.findById(eventId);
  }

  async updateStatus(eventId: string, status: EventStatus): Promise<EventItem | null> {
    const current = await this.repository.findById(eventId);
    if (!current) {
      return null;
    }

    if (!isAllowedStatusTransition(current.status, status)) {
      throw new InvalidStatusTransitionError(
        `Cannot change event status from ${current.status} to ${status}`
      );
    }

    return this.repository.updateStatus(eventId, status, current.status);
  }
}
