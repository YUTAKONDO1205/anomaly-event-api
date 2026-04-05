import { EventItem } from "../models/event";

export interface DetectImageInput {
  deviceId: string;
  sectionId: string;
  distance: number;
  detectedAt: string;
  imageKey: string;
  imageContentType?: string;
  imageDataBase64?: string;
  note?: string;
}

export interface DetectionLabel {
  name: string;
  confidence: number;
}

export type DetectionRuntimeMode = "aws" | "local";
export type DetectionConfidenceBand = "LOW" | "MEDIUM" | "HIGH";

export interface DetectionContribution {
  key: string;
  label: string;
  value: number;
  contribution: number;
  direction: "supports" | "suppresses";
}

export interface DetectionFocusRegion {
  id: string;
  label: string;
  x: number;
  y: number;
  width: number;
  height: number;
  intensity: number;
}

export interface DetectionAttentionGrid {
  rows: number;
  cols: number;
  values: number[];
}

export interface DetectionHeatmap {
  width: number;
  height: number;
  alpha: number;
  rawDataUrl: string;
  overlayDataUrl: string;
}

export interface DetectionModelMetrics {
  accuracy: number;
  precision: number;
  recall: number;
  f1: number;
  auc: number;
  recommendedThreshold?: number;
}

export interface DetectionDatasetSummary {
  positive: number;
  negative: number;
  total: number;
  manifestGeneratedAt?: string | null;
}

export interface DetectionModelInfo {
  provider: string;
  classifier: string;
  version: string;
  trainedAt?: string | null;
  ready: boolean;
  metrics?: DetectionModelMetrics | null;
  dataset?: DetectionDatasetSummary | null;
}

export interface DetectionExplanation {
  summary: string;
  confidenceBand: DetectionConfidenceBand;
  dominantSignals: string[];
  recommendedAction: string;
  contributions: DetectionContribution[];
  focusRegions: DetectionFocusRegion[];
  attentionGrid: DetectionAttentionGrid | null;
  heatmap: DetectionHeatmap | null;
}

export interface DetectImageResult {
  imageKey: string;
  anomalyDetected: boolean;
  anomalyConfidence: number;
  threshold: number;
  targetLabel: string;
  topLabel: DetectionLabel | null;
  labels: DetectionLabel[];
  provider: string;
  processingMs: number;
  model: DetectionModelInfo;
  explanation: DetectionExplanation;
  event: EventItem | null;
}
