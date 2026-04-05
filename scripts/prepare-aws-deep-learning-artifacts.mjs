import { promises as fs } from "node:fs";
import path from "node:path";

const repoRoot = process.cwd();
const sourceRoot = path.join(repoRoot, "local-storage", "ml");
const targetRoot = path.join(repoRoot, "aws", "deep-learning-artifacts", "model");
const sourceModelPath = path.join(sourceRoot, "crack-local-model.json");
const sourceWeightsPath = path.join(sourceRoot, "crack-local-model.pt");
const targetModelPath = path.join(targetRoot, "crack-local-model.json");
const targetWeightsPath = path.join(targetRoot, "crack-local-model.pt");

async function ensureExists(filePath) {
  try {
    await fs.access(filePath);
  } catch {
    throw new Error(`Missing required file: ${path.relative(repoRoot, filePath)}. Run \`npm run ml:train\` first.`);
  }
}

async function main() {
  await ensureExists(sourceModelPath);
  await ensureExists(sourceWeightsPath);

  await fs.mkdir(targetRoot, { recursive: true });

  const artifact = JSON.parse(await fs.readFile(sourceModelPath, "utf8"));
  artifact.weightsFile = "./crack-local-model.pt";

  await fs.writeFile(targetModelPath, JSON.stringify(artifact, null, 2), "utf8");
  await fs.copyFile(sourceWeightsPath, targetWeightsPath);

  console.log(`Prepared AWS deep-learning artifacts in ${path.relative(repoRoot, targetRoot)}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
