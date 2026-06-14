import { EventSeverity, EventStatus } from "../models/event";
import { DetectionModelInfo, DetectionRuntimeMode } from "./detection";

export interface DashboardStatusSummary {
  NEW: number;
  CHECKING: number;
  RESOLVED: number;
}

export interface DashboardSeveritySummary {
  LOW: number;
  MEDIUM: number;
  HIGH: number;
}

export interface DashboardSnapshot {
  runtime: {
    storageMode: DetectionRuntimeMode;
    detectionProvider: string;
    targetLabel: string;
    threshold: number;
  };
  dataset: {
    positiveSamples: number;
    negativeSamples: number;
    totalSamples: number;
    generatedAt: string | null;
  };
  model: DetectionModelInfo | null;
  events: {
    total: number;
    averageConfidence: number;
    latestDetectionAt: string | null;
    byStatus: DashboardStatusSummary;
    bySeverity: DashboardSeveritySummary;
  };
  highlights: string[];
}

export function createEmptyStatusSummary(): DashboardStatusSummary {
  return {
    NEW: 0,
    CHECKING: 0,
    RESOLVED: 0
  };
}

export function createEmptySeveritySummary(): DashboardSeveritySummary {
  return {
    LOW: 0,
    MEDIUM: 0,
    HIGH: 0
  };
}

export function incrementStatus(summary: DashboardStatusSummary, status: EventStatus) {
  // Guard against legacy/corrupted data carrying an out-of-enum status, which
  // would otherwise make summary[status] undefined and += 1 yield NaN.
  if (Object.prototype.hasOwnProperty.call(summary, status)) {
    summary[status] += 1;
  }
}

export function incrementSeverity(summary: DashboardSeveritySummary, severity?: EventSeverity) {
  if (!severity) {
    return;
  }

  if (Object.prototype.hasOwnProperty.call(summary, severity)) {
    summary[severity] += 1;
  }
}
