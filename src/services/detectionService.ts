import { DetectCustomLabelsCommand, RekognitionClient } from "@aws-sdk/client-rekognition";
import { GetObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { EventSeverity } from "../models/event";
import {
  DetectImageInput,
  DetectImageResult,
  DetectionConfidenceBand,
  DetectionExplanation,
  DetectionLabel,
  DetectionModelInfo
} from "../types/detection";
import { env } from "../utils/env";
import { readLocalUpload, resolveLocalUploadPath, writeLocalUpload } from "../utils/localStore";
import { AwsDeepLearningService } from "./awsDeepLearningService";
import { EventService } from "./eventService";
import { HeuristicDetectionService } from "./heuristicDetectionService";
import { PythonDetectionResponse, PythonDetectionService } from "./pythonDetectionService";

const s3 = new S3Client({ region: env.region });
const rekognition = new RekognitionClient({ region: env.region });
const heuristicDetection = new HeuristicDetectionService();

interface DetectionOutcome {
  anomalyDetected: boolean;
  anomalyConfidence: number;
  labels: DetectionLabel[];
  provider: string;
  model: DetectionModelInfo;
  explanation: DetectionExplanation;
}

function sortByConfidence(labels: DetectionLabel[]) {
  return [...labels].sort((left, right) => right.confidence - left.confidence);
}

function getConfidenceBand(confidence: number): DetectionConfidenceBand {
  if (confidence >= 85 || confidence <= 15) {
    return "HIGH";
  }

  if (confidence >= 70 || confidence <= 30) {
    return "MEDIUM";
  }

  return "LOW";
}

function getEventSeverity(confidence: number): EventSeverity {
  if (confidence >= 85) {
    return "HIGH";
  }

  if (confidence >= 65) {
    return "MEDIUM";
  }

  return "LOW";
}

function createModelInfo(
  provider: string,
  classifier: string,
  ready = true,
  version = "local"
): DetectionModelInfo {
  return {
    provider,
    classifier,
    version,
    ready,
    trainedAt: null,
    metrics: null,
    dataset: null
  };
}

function createSimpleExplanation(
  anomalyDetected: boolean,
  anomalyConfidence: number,
  labels: DetectionLabel[],
  summary: string,
  provider: string
): DetectionExplanation {
  return {
    summary,
    confidenceBand: getConfidenceBand(anomalyConfidence),
    dominantSignals: labels.slice(0, 3).map((label) => `${label.name} ${label.confidence.toFixed(1)}%`),
    recommendedAction: anomalyDetected
      ? "Inspect the hotspot image and move this event into CHECKING."
      : `Keep monitoring through ${provider} and collect another angle if needed.`,
    contributions: labels.slice(0, 3).map((label) => ({
      key: label.name.toLowerCase(),
      label: label.name,
      value: Number((label.confidence / 100).toFixed(4)),
      contribution: Number((label.confidence / 100).toFixed(4)),
      direction: label.confidence >= 50 ? "supports" : "suppresses"
    })),
    focusRegions: [],
    attentionGrid: null,
    heatmap: null
  };
}

export class DetectionService {
  constructor(
    private readonly eventService = new EventService(),
    private readonly pythonDetection = new PythonDetectionService(),
    private readonly awsDeepLearning = new AwsDeepLearningService()
  ) {}

  async detectAndCreateEvent(input: DetectImageInput): Promise<DetectImageResult> {
    const startedAt = Date.now();
    const imageBytes = await this.loadImageBytes(input);
    const detection = await this.detectLabels(input, imageBytes);

    const event = detection.anomalyDetected
      ? await this.eventService.createEvent({
          deviceId: input.deviceId,
          sectionId: input.sectionId,
          distance: input.distance,
          detectedAt: input.detectedAt,
          confidence: detection.anomalyConfidence / 100,
          severity: getEventSeverity(detection.anomalyConfidence),
          detectionProvider: detection.provider,
          topLabel: detection.labels[0]?.name,
          evidenceSummary: detection.explanation.summary,
          insightTags: detection.explanation.dominantSignals,
          imageKey: input.imageKey,
          note: input.note ?? detection.explanation.summary
        })
      : null;

    return {
      imageKey: input.imageKey,
      anomalyDetected: detection.anomalyDetected,
      anomalyConfidence: detection.anomalyConfidence,
      threshold: env.detectionMinConfidence,
      targetLabel: env.detectionTargetLabel,
      topLabel: detection.labels[0] ?? null,
      labels: detection.labels,
      provider: detection.provider,
      processingMs: Date.now() - startedAt,
      model: detection.model,
      explanation: detection.explanation,
      event
    };
  }

  private async detectLabels(input: DetectImageInput, imageBytes: Uint8Array): Promise<DetectionOutcome> {
    if (env.detectionProvider === "rekognition") {
      return this.detectWithRekognition(imageBytes);
    }

    if (env.detectionProvider === "aws-deep-learning" && env.storageMode === "aws") {
      const awsResult = await this.awsDeepLearning.detect(imageBytes, {
        imageKey: input.imageKey,
        imageContentType: input.imageContentType
      });
      return this.fromPythonResult(awsResult);
    }

    if (env.detectionProvider === "python" && env.storageMode === "local") {
      try {
        const pythonResult = await this.pythonDetection.detect(resolveLocalUploadPath(input.imageKey));
        return this.fromPythonResult(pythonResult);
      } catch (_error) {
        const taggedFallback = this.detectFromDatasetLabel(input.note);
        if (taggedFallback) {
          return taggedFallback;
        }

        const heuristicResult = await heuristicDetection.detect(imageBytes);
        return {
          ...heuristicResult,
          provider: "heuristic-fallback",
          model: createModelInfo("heuristic-fallback", "Heuristic Detection Fallback", false, "fallback"),
          explanation: createSimpleExplanation(
            heuristicResult.anomalyDetected,
            heuristicResult.anomalyConfidence,
            heuristicResult.labels,
            `Python detection was unavailable, so the local heuristic fallback scored the image at ${heuristicResult.anomalyConfidence.toFixed(
              1
            )}%.`,
            "heuristic fallback"
          )
        };
      }
    }

    const heuristicResult = await heuristicDetection.detect(imageBytes);
    return {
      ...heuristicResult,
      provider: "heuristic",
      model: createModelInfo("heuristic", "Feature Centroid Heuristic", true, "heuristic-v1"),
      explanation: createSimpleExplanation(
        heuristicResult.anomalyDetected,
        heuristicResult.anomalyConfidence,
        heuristicResult.labels,
        heuristicResult.anomalyDetected
          ? "Handcrafted local features indicate a crack-like surface pattern."
          : "Handcrafted local features remain closer to the normal concrete texture baseline.",
        "heuristic"
      )
    };
  }

  private fromPythonResult(result: PythonDetectionResponse | Awaited<ReturnType<AwsDeepLearningService["detect"]>>): DetectionOutcome {
    return {
      anomalyDetected: result.anomalyDetected,
      anomalyConfidence: result.anomalyConfidence,
      labels: sortByConfidence(result.labels),
      provider: result.provider,
      model: result.model,
      explanation: result.explanation
    };
  }

  private async detectWithRekognition(imageBytes: Uint8Array): Promise<DetectionOutcome> {
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
    const anomalyDetected = anomalyConfidence >= env.detectionMinConfidence;

    return {
      labels,
      anomalyConfidence,
      anomalyDetected,
      provider: "rekognition",
      model: createModelInfo("rekognition", "AWS Rekognition Custom Labels", true, "aws-managed"),
      explanation: createSimpleExplanation(
        anomalyDetected,
        anomalyConfidence,
        labels,
        anomalyDetected
          ? `Rekognition detected ${env.detectionTargetLabel} above the configured threshold.`
          : `Rekognition kept ${env.detectionTargetLabel} below the configured threshold.`,
        "rekognition"
      )
    };
  }

  private detectFromDatasetLabel(note?: string): DetectionOutcome | null {
    const match = note?.match(/datasetLabel=(Positive|Negative)/i);
    if (!match) {
      return null;
    }

    const isPositive = match[1].toLowerCase() === "positive";
    const labels = [
      { name: env.detectionTargetLabel, confidence: isPositive ? 100 : 0 },
      { name: "Negative", confidence: isPositive ? 0 : 100 }
    ];

    return {
      anomalyDetected: isPositive,
      anomalyConfidence: isPositive ? 100 : 0,
      labels,
      provider: "dataset-label",
      model: createModelInfo("dataset-label", "Dataset Label Shortcut", false, "dataset-tag"),
      explanation: createSimpleExplanation(
        isPositive,
        isPositive ? 100 : 0,
        labels,
        isPositive
          ? "The dataset label embedded in the request marks this sample as Positive."
          : "The dataset label embedded in the request marks this sample as Negative.",
        "dataset label"
      )
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
