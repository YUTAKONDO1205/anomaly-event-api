import path from "node:path";

function getEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing environment variable: ${name}`);
  }
  return value;
}

function getOptionalEnv(name: string): string | undefined {
  const value = process.env[name]?.trim();
  return value ? value : undefined;
}

function getNumberEnv(name: string, fallback: number): number {
  const value = process.env[name];
  if (!value) {
    return fallback;
  }

  const parsed = Number(value);
  if (Number.isNaN(parsed)) {
    throw new Error(`Environment variable ${name} must be a number`);
  }

  return parsed;
}

function getStorageMode(): "aws" | "local" {
  return process.env.APP_STORAGE_MODE === "local" ? "local" : "aws";
}

function getDetectionProvider(
  defaultProvider: "rekognition" | "heuristic" | "python"
): "rekognition" | "heuristic" | "python" {
  const value = process.env.DETECTION_PROVIDER?.trim();
  if (value === "python" || value === "heuristic" || value === "rekognition") {
    return value;
  }

  return defaultProvider;
}

const storageMode = getStorageMode();
const detectionProjectVersionArn = getOptionalEnv("REKOGNITION_PROJECT_VERSION_ARN");
const detectionProvider = getDetectionProvider(
  detectionProjectVersionArn ? "rekognition" : storageMode === "local" ? "python" : "heuristic"
);
const defaultMinConfidence =
  detectionProvider === "rekognition" ? 80 : detectionProvider === "python" ? 55 : 50;

export const env = {
  storageMode,
  detectionProvider,
  eventsTable: storageMode === "aws" ? getEnv("EVENTS_TABLE") : process.env.EVENTS_TABLE || "local-events",
  eventImagesBucket:
    storageMode === "aws" ? getEnv("EVENT_IMAGES_BUCKET") : process.env.EVENT_IMAGES_BUCKET || "local-uploads",
  region: process.env.AWS_REGION || "ap-northeast-1",
  detectionProjectVersionArn,
  detectionTargetLabel: process.env.DETECTION_TARGET_LABEL?.trim() || "Positive",
  detectionMinConfidence: getNumberEnv("DETECTION_MIN_CONFIDENCE", defaultMinConfidence),
  localUploadsDir: path.resolve(process.cwd(), process.env.LOCAL_UPLOADS_DIR || "local-storage/uploads"),
  localEventsFile: path.resolve(process.cwd(), process.env.LOCAL_EVENTS_FILE || "local-storage/events/events.json"),
  pythonExecutable: process.env.PYTHON_EXECUTABLE?.trim() || "python",
  pythonDetectionScript: path.resolve(
    process.cwd(),
    process.env.PYTHON_DETECTION_SCRIPT || "python/crack_ml.py"
  ),
  pythonModelPath: path.resolve(
    process.cwd(),
    process.env.PYTHON_MODEL_PATH || "local-storage/ml/crack-local-model.json"
  ),
  datasetManifestFile: path.resolve(
    process.cwd(),
    process.env.DATASET_MANIFEST_FILE || "datasets/manifests/index.json"
  )
};
