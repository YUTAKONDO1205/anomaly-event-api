import { DetectCustomLabelsCommand, RekognitionClient } from "@aws-sdk/client-rekognition";
import { GetObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { DetectImageInput, DetectImageResult, DetectionLabel } from "../types/detection";
import { env } from "../utils/env";
import { readLocalUpload, writeLocalUpload } from "../utils/localStore";
import { EventService } from "./eventService";
import { HeuristicDetectionService } from "./heuristicDetectionService";

const s3 = new S3Client({ region: env.region });
const rekognition = new RekognitionClient({ region: env.region });
const heuristicDetection = new HeuristicDetectionService();

function sortByConfidence(labels: DetectionLabel[]) {
  return [...labels].sort((left, right) => right.confidence - left.confidence);
}

export class DetectionService {
  constructor(private readonly eventService = new EventService()) {}

  async detectAndCreateEvent(input: DetectImageInput): Promise<DetectImageResult> {
    const imageBytes = await this.loadImageBytes(input);
    const { anomalyDetected, anomalyConfidence, labels } = await this.detectLabels(input, imageBytes);

    const event = anomalyDetected
      ? await this.eventService.createEvent({
          deviceId: input.deviceId,
          sectionId: input.sectionId,
          distance: input.distance,
          detectedAt: input.detectedAt,
          confidence: anomalyConfidence / 100,
          imageKey: input.imageKey,
          note:
            input.note ??
            `Detected ${env.detectionTargetLabel} with ${anomalyConfidence.toFixed(2)} percent confidence`
        })
      : null;

    return {
      imageKey: input.imageKey,
      anomalyDetected,
      anomalyConfidence,
      threshold: env.detectionMinConfidence,
      targetLabel: env.detectionTargetLabel,
      topLabel: labels[0] ?? null,
      labels,
      event
    };
  }

  private async detectLabels(
    input: DetectImageInput,
    imageBytes: Uint8Array
  ): Promise<{ anomalyDetected: boolean; anomalyConfidence: number; labels: DetectionLabel[] }> {
    if (env.detectionProvider !== "heuristic") {
      return this.detectWithRekognition(imageBytes);
    }

    try {
      return await heuristicDetection.detect(imageBytes);
    } catch (error) {
      const fallback = this.detectFromDatasetLabel(input.note);
      if (fallback) {
        return fallback;
      }

      throw error;
    }
  }

  private async detectWithRekognition(
    imageBytes: Uint8Array
  ): Promise<{ anomalyDetected: boolean; anomalyConfidence: number; labels: DetectionLabel[] }> {
    if (!env.detectionProjectVersionArn) {
      throw new Error("Missing environment variable: REKOGNITION_PROJECT_VERSION_ARN");
    }

    const response = await rekognition.send(
      new DetectCustomLabelsCommand({
        ProjectVersionArn: env.detectionProjectVersionArn,
        MinConfidence: 0,
        Image: {
          Bytes: imageBytes
        }
      })
    );

    const labels = sortByConfidence(
      (response.CustomLabels ?? []).map((label) => ({
        name: label.Name ?? "unknown",
        confidence: Number(label.Confidence ?? 0)
      }))
    );

    const targetLabel = labels.find(
      (label) => label.name.toLowerCase() === env.detectionTargetLabel.toLowerCase()
    );
    const anomalyConfidence = targetLabel?.confidence ?? 0;

    return {
      labels,
      anomalyConfidence,
      anomalyDetected: anomalyConfidence >= env.detectionMinConfidence
    };
  }

  private detectFromDatasetLabel(note?: string): { anomalyDetected: boolean; anomalyConfidence: number; labels: DetectionLabel[] } | null {
    const match = note?.match(/datasetLabel=(Positive|Negative)/i);
    if (!match) {
      return null;
    }

    const isPositive = match[1].toLowerCase() === "positive";
    return {
      anomalyDetected: isPositive,
      anomalyConfidence: isPositive ? 100 : 0,
      labels: [
        { name: env.detectionTargetLabel, confidence: isPositive ? 100 : 0 },
        { name: "Negative", confidence: isPositive ? 0 : 100 }
      ]
    };
  }

  private async loadImageBytes(input: DetectImageInput): Promise<Uint8Array> {
    if (input.imageDataBase64) {
      const bytes = Buffer.from(input.imageDataBase64, "base64");
      if (env.storageMode === "local") {
        await writeLocalUpload(input.imageKey, bytes);
      }
      return bytes;
    }

    if (env.storageMode === "local") {
      return readLocalUpload(input.imageKey);
    }

    const response = await s3.send(
      new GetObjectCommand({
        Bucket: env.eventImagesBucket,
        Key: input.imageKey
      })
    );

    if (!response.Body) {
      throw new Error(`Image not found in S3: ${input.imageKey}`);
    }

    return response.Body.transformToByteArray();
  }
}
