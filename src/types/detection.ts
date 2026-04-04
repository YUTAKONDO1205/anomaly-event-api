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

export interface DetectImageResult {
  imageKey: string;
  anomalyDetected: boolean;
  anomalyConfidence: number;
  threshold: number;
  targetLabel: string;
  topLabel: DetectionLabel | null;
  labels: DetectionLabel[];
  event: EventItem | null;
}
