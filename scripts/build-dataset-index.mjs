import { promises as fs } from "node:fs";
import path from "node:path";

const repoRoot = process.cwd();
const configPath = path.join(repoRoot, "dataset.config.json");
const defaultConfig = {
  positiveDir: path.join(repoRoot, "datasets", "raw", "positive"),
  negativeDir: path.join(repoRoot, "datasets", "raw", "negative"),
  outputFile: path.join(repoRoot, "datasets", "manifests", "index.json"),
  maxImagesPerClass: 0,
  shuffle: false
};

const allowedExtensions = new Set([".jpg", ".jpeg", ".png", ".webp"]);

function normalizeConfig(raw = {}) {
  return {
    ...defaultConfig,
    ...raw,
    positiveDir: path.resolve(repoRoot, raw.positiveDir ?? defaultConfig.positiveDir),
    negativeDir: path.resolve(repoRoot, raw.negativeDir ?? defaultConfig.negativeDir),
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

async function collectFiles(rootDir) {
  const results = [];

  async function walk(currentDir) {
    const entries = await fs.readdir(currentDir, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(currentDir, entry.name);
      if (entry.isDirectory()) {
        await walk(fullPath);
        continue;
      }

      const extension = path.extname(entry.name).toLowerCase();
      if (allowedExtensions.has(extension)) {
        results.push(fullPath);
      }
    }
  }

  await walk(rootDir);
  return results;
}

function maybeShuffle(items, enabled) {
  if (!enabled) {
    return items;
  }

  const next = [...items];
  for (let index = next.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [next[index], next[swapIndex]] = [next[swapIndex], next[index]];
  }
  return next;
}

function toRelativeLabelPath(rootDir, filePath) {
  return path.relative(rootDir, filePath).split(path.sep).join("/");
}

async function buildClassEntries(label, rootDir, config) {
  const files = maybeShuffle(await collectFiles(rootDir), config.shuffle);
  const limitedFiles =
    config.maxImagesPerClass && config.maxImagesPerClass > 0
      ? files.slice(0, config.maxImagesPerClass)
      : files;

  return limitedFiles.map((filePath) => ({
    label,
    filePath,
    relativePath: toRelativeLabelPath(rootDir, filePath),
    fileName: path.basename(filePath)
  }));
}

async function main() {
  const config = await loadConfig();
  await fs.mkdir(path.dirname(config.outputFile), { recursive: true });

  const [positive, negative] = await Promise.all([
    buildClassEntries("Positive", config.positiveDir, config),
    buildClassEntries("Negative", config.negativeDir, config)
  ]);

  const payload = {
    generatedAt: new Date().toISOString(),
    totals: {
      positive: positive.length,
      negative: negative.length,
      all: positive.length + negative.length
    },
    images: [...positive, ...negative]
  };

  await fs.writeFile(config.outputFile, JSON.stringify(payload, null, 2), "utf8");

  console.log(`Dataset index created: ${config.outputFile}`);
  console.log(`Positive: ${positive.length}`);
  console.log(`Negative: ${negative.length}`);
  console.log(`All: ${payload.totals.all}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
