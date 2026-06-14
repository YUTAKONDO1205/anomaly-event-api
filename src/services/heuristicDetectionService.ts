import { promises as fs } from "node:fs";
import path from "node:path";
import jpeg from "jpeg-js";
import { PNG } from "pngjs";
import { env } from "../utils/env";
import { logger } from "../utils/logger";

interface DecodedImage {
  width: number;
  height: number;
  data: Uint8Array;
}

interface FeatureVector {
  darkness: number;
  contrast: number;
  edgeRatio: number;
  darkEdgeRatio: number;
  darkPixelRatio: number;
}

interface TrainedModel {
  positiveCentroid: FeatureVector;
  negativeCentroid: FeatureVector;
}

interface DatasetManifestEntry {
  label: string;
  filePath: string;
}

function isJpeg(bytes: Uint8Array): boolean {
  return bytes.length > 2 && bytes[0] === 0xff && bytes[1] === 0xd8;
}

function isPng(bytes: Uint8Array): boolean {
  return (
    bytes.length > 7 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47
  );
}

function decodeImage(bytes: Uint8Array): DecodedImage {
  if (isJpeg(bytes)) {
    const decoded = jpeg.decode(bytes, { useTArray: true });
    return {
      width: decoded.width,
      height: decoded.height,
      data: decoded.data
    };
  }

  if (isPng(bytes)) {
    const decoded = PNG.sync.read(Buffer.from(bytes));
    return {
      width: decoded.width,
      height: decoded.height,
      data: decoded.data
    };
  }

  throw new Error("Local detection supports JPEG and PNG images only");
}

function buildGrayscale(decoded: DecodedImage): { width: number; height: number; values: Float32Array } {
  const maxDimension = 256;
  const scale =
    Math.max(decoded.width, decoded.height) > maxDimension
      ? Math.max(decoded.width, decoded.height) / maxDimension
      : 1;
  const width = Math.max(2, Math.round(decoded.width / scale));
  const height = Math.max(2, Math.round(decoded.height / scale));
  const values = new Float32Array(width * height);

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const sourceX = Math.min(decoded.width - 1, Math.round(x * scale));
      const sourceY = Math.min(decoded.height - 1, Math.round(y * scale));
      const offset = (sourceY * decoded.width + sourceX) * 4;
      const red = decoded.data[offset];
      const green = decoded.data[offset + 1];
      const blue = decoded.data[offset + 2];
      values[y * width + x] = red * 0.299 + green * 0.587 + blue * 0.114;
    }
  }

  return { width, height, values };
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function extractFeatures(bytes: Uint8Array): FeatureVector {
  const grayscale = buildGrayscale(decodeImage(bytes));
  let sum = 0;
  let sumSquared = 0;
  let darkPixels = 0;
  let edges = 0;
  let darkEdges = 0;

  for (let y = 1; y < grayscale.height - 1; y += 1) {
    for (let x = 1; x < grayscale.width - 1; x += 1) {
      const index = y * grayscale.width + x;
      const current = grayscale.values[index];
      sum += current;
      sumSquared += current * current;

      if (current < 92) {
        darkPixels += 1;
      }

      const gx =
        -grayscale.values[index - grayscale.width - 1] -
        2 * grayscale.values[index - 1] -
        grayscale.values[index + grayscale.width - 1] +
        grayscale.values[index - grayscale.width + 1] +
        2 * grayscale.values[index + 1] +
        grayscale.values[index + grayscale.width + 1];

      const gy =
        -grayscale.values[index - grayscale.width - 1] -
        2 * grayscale.values[index - grayscale.width] -
        grayscale.values[index - grayscale.width + 1] +
        grayscale.values[index + grayscale.width - 1] +
        2 * grayscale.values[index + grayscale.width] +
        grayscale.values[index + grayscale.width + 1];

      const gradient = Math.sqrt(gx * gx + gy * gy);
      if (gradient > 110) {
        edges += 1;
      }

      if (gradient > 110 && current < 128) {
        darkEdges += 1;
      }
    }
  }

  const sampleCount = Math.max(1, (grayscale.width - 2) * (grayscale.height - 2));
  const mean = sum / sampleCount;
  const variance = Math.max(0, sumSquared / sampleCount - mean * mean);
  const contrast = Math.sqrt(variance) / 255;

  return {
    darkness: clamp((148 - mean) / 148, 0, 1),
    contrast,
    edgeRatio: edges / sampleCount,
    darkEdgeRatio: darkEdges / sampleCount,
    darkPixelRatio: darkPixels / sampleCount
  };
}

function averageVectors(vectors: FeatureVector[]): FeatureVector {
  const total = vectors.reduce(
    (acc, item) => ({
      darkness: acc.darkness + item.darkness,
      contrast: acc.contrast + item.contrast,
      edgeRatio: acc.edgeRatio + item.edgeRatio,
      darkEdgeRatio: acc.darkEdgeRatio + item.darkEdgeRatio,
      darkPixelRatio: acc.darkPixelRatio + item.darkPixelRatio
    }),
    {
      darkness: 0,
      contrast: 0,
      edgeRatio: 0,
      darkEdgeRatio: 0,
      darkPixelRatio: 0
    }
  );

  return {
    darkness: total.darkness / vectors.length,
    contrast: total.contrast / vectors.length,
    edgeRatio: total.edgeRatio / vectors.length,
    darkEdgeRatio: total.darkEdgeRatio / vectors.length,
    darkPixelRatio: total.darkPixelRatio / vectors.length
  };
}

function vectorDistance(left: FeatureVector, right: FeatureVector): number {
  return Math.sqrt(
    (left.darkness - right.darkness) ** 2 +
      (left.contrast - right.contrast) ** 2 +
      (left.edgeRatio - right.edgeRatio) ** 2 +
      (left.darkEdgeRatio - right.darkEdgeRatio) ** 2 +
      (left.darkPixelRatio - right.darkPixelRatio) ** 2
  );
}

async function loadDatasetEntries(): Promise<DatasetManifestEntry[]> {
  const manifestPath = path.resolve(process.cwd(), "datasets/manifests/index.json");

  try {
    const content = await fs.readFile(manifestPath, "utf8");
    const parsed = JSON.parse(content) as { images?: DatasetManifestEntry[] };
    return Array.isArray(parsed.images) ? parsed.images : [];
  } catch {
    return [];
  }
}

export class HeuristicDetectionService {
  private readonly modelPromise: Promise<TrainedModel | null>;

  constructor() {
    // Never leave the training promise unhandled: a rejection here would become
    // an unhandledRejection until the first detect() awaits it. Degrade to the
    // formula fallback (null model) instead.
    this.modelPromise = this.trainModel().catch((error) => {
      logger.error("Heuristic model training failed; using formula fallback", {
        error: error instanceof Error ? error.message : String(error)
      });
      return null;
    });
  }

  async detect(bytes: Uint8Array) {
    const features = extractFeatures(bytes);
    const model = await this.modelPromise;

    let positiveConfidence = 0;
    if (model) {
      const positiveDistance = vectorDistance(features, model.positiveCentroid);
      const negativeDistance = vectorDistance(features, model.negativeCentroid);
      positiveConfidence = clamp(
        (negativeDistance / Math.max(positiveDistance + negativeDistance, 0.0001)) * 100,
        0,
        100
      );
    } else {
      positiveConfidence = clamp(
        features.darkEdgeRatio * 340 +
          features.edgeRatio * 150 +
          features.contrast * 55 +
          features.darkness * 20 -
          features.darkPixelRatio * 18,
        0,
        100
      );
    }

    const negativeConfidence = clamp(100 - positiveConfidence, 0, 100);
    const anomalyDetected = positiveConfidence >= env.detectionMinConfidence;
    const labels = [
      { name: env.detectionTargetLabel, confidence: Number(positiveConfidence.toFixed(2)) },
      { name: "Negative", confidence: Number(negativeConfidence.toFixed(2)) }
    ].sort((left, right) => right.confidence - left.confidence);

    return {
      anomalyDetected,
      anomalyConfidence: Number(positiveConfidence.toFixed(2)),
      labels
    };
  }

  private async trainModel(): Promise<TrainedModel | null> {
    const entries = await loadDatasetEntries();
    const positiveEntries = entries.filter((entry) => entry.label === "Positive");
    const negativeEntries = entries.filter((entry) => entry.label === "Negative");

    if (positiveEntries.length === 0 || negativeEntries.length === 0) {
      return null;
    }

    const [positiveVectors, negativeVectors] = await Promise.all([
      this.extractVectors(positiveEntries),
      this.extractVectors(negativeEntries)
    ]);

    // If every sample of a class was undecodable/unreadable, fall back to the
    // formula model rather than averaging an empty array (which yields NaN).
    if (positiveVectors.length === 0 || negativeVectors.length === 0) {
      return null;
    }

    return {
      positiveCentroid: averageVectors(positiveVectors),
      negativeCentroid: averageVectors(negativeVectors)
    };
  }

  private async extractVectors(entries: DatasetManifestEntry[]): Promise<FeatureVector[]> {
    const settled = await Promise.allSettled(
      entries.map((entry) => fs.readFile(entry.filePath).then(extractFeatures))
    );

    return settled
      .filter((result): result is PromiseFulfilledResult<FeatureVector> => result.status === "fulfilled")
      .map((result) => result.value);
  }
}
