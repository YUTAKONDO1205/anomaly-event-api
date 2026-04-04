import { promises as fs } from "node:fs";
import path from "node:path";

const repoRoot = process.cwd();
const configPath = path.join(repoRoot, "dataset.config.json");
const defaultConfig = {
  outputFile: path.join(repoRoot, "datasets", "manifests", "index.json"),
  apiBaseUrl: "http://127.0.0.1:3000",
  defaultDeviceId: "drone-importer",
  defaultSectionId: "crack-scan",
  defaultDistance: 0,
  concurrency: 2
};

const contentTypes = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp"
};

function normalizeConfig(raw = {}) {
  return {
    ...defaultConfig,
    ...raw,
    outputFile: path.resolve(repoRoot, raw.outputFile ?? defaultConfig.outputFile)
  };
}

async function loadConfig() {
  try {
    const content = await fs.readFile(configPath, "utf8");
    return normalizeConfig(JSON.parse(content));
  } catch (error) {
    if (error && error.code === "ENOENT") {
      return defaultConfig;
    }
    throw error;
  }
}

async function readDatasetIndex(outputFile) {
  const content = await fs.readFile(outputFile, "utf8");
  return JSON.parse(content);
}

function getContentType(filePath) {
  return contentTypes[path.extname(filePath).toLowerCase()] ?? null;
}

async function requestUploadUrl(apiBaseUrl, contentType) {
  const response = await fetch(`${apiBaseUrl}/upload-url`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ contentType })
  });

  if (!response.ok) {
    throw new Error(`Upload URL request failed with ${response.status}`);
  }

  const json = await response.json();
  return json.data;
}

async function uploadFile(uploadUrl, contentType, fileBuffer) {
  const response = await fetch(uploadUrl, {
    method: "PUT",
    headers: {
      "Content-Type": contentType
    },
    body: fileBuffer
  });

  if (!response.ok) {
    throw new Error(`S3 upload failed with ${response.status}`);
  }
}

function toBase64(fileBuffer) {
  return Buffer.from(fileBuffer).toString("base64");
}

async function detectImage(apiBaseUrl, payload) {
  const response = await fetch(`${apiBaseUrl}/detect`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Detect request failed with ${response.status}: ${text}`);
  }

  return response.json();
}

async function runWithConcurrency(items, concurrency, iterator) {
  let index = 0;
  const workers = Array.from({ length: Math.max(concurrency, 1) }, async () => {
    while (true) {
      const currentIndex = index;
      index += 1;

      if (currentIndex >= items.length) {
        return;
      }

      await iterator(items[currentIndex], currentIndex);
    }
  });

  await Promise.all(workers);
}

async function main() {
  const config = await loadConfig();
  const dataset = await readDatasetIndex(config.outputFile);
  const images = dataset.images ?? [];

  if (images.length === 0) {
    console.log("No images found in dataset index.");
    return;
  }

  let processed = 0;
  let anomalyCount = 0;
  let failureCount = 0;

  await runWithConcurrency(images, config.concurrency, async (entry) => {
    const contentType = getContentType(entry.filePath);
    if (!contentType) {
      failureCount += 1;
      return;
    }

    try {
      const fileBuffer = await fs.readFile(entry.filePath);
      const upload = await requestUploadUrl(config.apiBaseUrl, contentType);
      if (upload.uploadMode === "presigned" && upload.uploadUrl) {
        await uploadFile(upload.uploadUrl, contentType, fileBuffer);
      }

      const stats = await fs.stat(entry.filePath);
      const detectPayload = {
        deviceId: `${config.defaultDeviceId}-${entry.label.toLowerCase()}`,
        sectionId: config.defaultSectionId,
        distance: config.defaultDistance,
        detectedAt: stats.mtime.toISOString(),
        imageKey: upload.key,
        imageContentType: contentType,
        imageDataBase64: upload.uploadMode === "inline" ? toBase64(fileBuffer) : undefined,
        note: `datasetLabel=${entry.label}; source=${entry.fileName}`
      };

      const detectResult = await detectImage(config.apiBaseUrl, detectPayload);
      if (detectResult.data?.anomalyDetected) {
        anomalyCount += 1;
      }

      processed += 1;
      console.log(
        `[${processed}/${images.length}] ${entry.label} ${entry.fileName} -> anomaly=${detectResult.data?.anomalyDetected ?? false}`
      );
    } catch (error) {
      failureCount += 1;
      console.error(`Failed: ${entry.filePath}`);
      console.error(error);
    }
  });

  console.log("Batch detection finished.");
  console.log(`Processed: ${processed}`);
  console.log(`Anomalies: ${anomalyCount}`);
  console.log(`Failures: ${failureCount}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
