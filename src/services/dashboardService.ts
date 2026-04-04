import { promises as fs } from "node:fs";
import { EventService } from "./eventService";
import {
  createEmptySeveritySummary,
  createEmptyStatusSummary,
  DashboardSnapshot,
  incrementSeverity,
  incrementStatus
} from "../types/dashboard";
import { env } from "../utils/env";
import { DetectionModelInfo } from "../types/detection";

interface DatasetManifest {
  generatedAt?: string;
  totals?: {
    positive?: number;
    negative?: number;
    all?: number;
  };
}

interface PythonModelArtifact {
  classifier?: string;
  version?: string;
  trainedAt?: string;
  dataset?: {
    positive?: number;
    negative?: number;
    total?: number;
    manifestGeneratedAt?: string | null;
  };
  metrics?: DetectionModelInfo["metrics"];
}

async function readJsonFile<T>(filePath: string): Promise<T | null> {
  try {
    const content = await fs.readFile(filePath, "utf8");
    return JSON.parse(content) as T;
  } catch {
    return null;
  }
}

export class DashboardService {
  constructor(private readonly eventService = new EventService()) {}

  async getSnapshot(): Promise<DashboardSnapshot> {
    const [events, manifest, modelArtifact] = await Promise.all([
      this.eventService.getEvents(),
      readJsonFile<DatasetManifest>(env.datasetManifestFile),
      readJsonFile<PythonModelArtifact>(env.pythonModelPath)
    ]);

    const byStatus = createEmptyStatusSummary();
    const bySeverity = createEmptySeveritySummary();
    let confidenceTotal = 0;

    for (const event of events) {
      incrementStatus(byStatus, event.status);
      incrementSeverity(bySeverity, event.severity);
      confidenceTotal += event.confidence;
    }

    const positiveSamples = manifest?.totals?.positive ?? modelArtifact?.dataset?.positive ?? 0;
    const negativeSamples = manifest?.totals?.negative ?? modelArtifact?.dataset?.negative ?? 0;
    const totalSamples =
      manifest?.totals?.all ?? modelArtifact?.dataset?.total ?? positiveSamples + negativeSamples;

    const model: DetectionModelInfo | null = modelArtifact
      ? {
          provider: env.detectionProvider,
          classifier: modelArtifact.classifier || "Local Python Model",
          version: modelArtifact.version || "local",
          trainedAt: modelArtifact.trainedAt || null,
          ready: true,
          metrics: modelArtifact.metrics ?? null,
          dataset: modelArtifact.dataset
            ? {
                positive: modelArtifact.dataset.positive ?? positiveSamples,
                negative: modelArtifact.dataset.negative ?? negativeSamples,
                total: modelArtifact.dataset.total ?? totalSamples,
                manifestGeneratedAt:
                  modelArtifact.dataset.manifestGeneratedAt ?? manifest?.generatedAt ?? null
              }
            : {
                positive: positiveSamples,
                negative: negativeSamples,
                total: totalSamples,
                manifestGeneratedAt: manifest?.generatedAt ?? null
              }
        }
      : null;

    const averageConfidence = events.length > 0 ? confidenceTotal / events.length : 0;
    const latestDetectionAt = events[0]?.detectedAt ?? null;

    const highlights = [
      `${env.detectionProvider.toUpperCase()} provider / threshold ${env.detectionMinConfidence}%`,
      totalSamples > 0
        ? `${totalSamples} samples indexed (${positiveSamples} positive / ${negativeSamples} negative)`
        : "Dataset manifest has not been generated yet",
      latestDetectionAt
        ? `Latest anomaly flow at ${new Date(latestDetectionAt).toLocaleString("ja-JP")}`
        : "No anomaly events have been stored yet"
    ];

    return {
      runtime: {
        storageMode: env.storageMode,
        detectionProvider: env.detectionProvider,
        targetLabel: env.detectionTargetLabel,
        threshold: env.detectionMinConfidence
      },
      dataset: {
        positiveSamples,
        negativeSamples,
        totalSamples,
        generatedAt: manifest?.generatedAt ?? null
      },
      model,
      events: {
        total: events.length,
        averageConfidence: Number(averageConfidence.toFixed(4)),
        latestDetectionAt,
        byStatus,
        bySeverity
      },
      highlights
    };
  }
}
