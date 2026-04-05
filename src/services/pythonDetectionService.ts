import { spawn } from "node:child_process";
import { DetectionExplanation, DetectionLabel, DetectionModelInfo } from "../types/detection";
import { env } from "../utils/env";

interface PythonDetectionRequest {
  imagePath: string;
  manifestPath: string;
  modelPath: string;
  targetLabel: string;
  threshold: number;
}

export interface PythonDetectionResponse {
  anomalyDetected: boolean;
  anomalyConfidence: number;
  labels: DetectionLabel[];
  provider: string;
  model: DetectionModelInfo;
  explanation: DetectionExplanation;
}

function isPythonDetectionResponse(value: unknown): value is PythonDetectionResponse {
  if (!value || typeof value !== "object") {
    return false;
  }

  const candidate = value as Partial<PythonDetectionResponse>;
  return (
    typeof candidate.anomalyDetected === "boolean" &&
    typeof candidate.anomalyConfidence === "number" &&
    Array.isArray(candidate.labels) &&
    typeof candidate.provider === "string" &&
    !!candidate.model &&
    !!candidate.explanation
  );
}

export class PythonDetectionService {
  async detect(imagePath: string): Promise<PythonDetectionResponse> {
    const payload: PythonDetectionRequest = {
      imagePath,
      manifestPath: env.datasetManifestFile,
      modelPath: env.pythonModelPath,
      targetLabel: env.detectionTargetLabel,
      threshold: env.detectionMinConfidence
    };

    const response = await this.runCommand("infer", payload);
    if (!isPythonDetectionResponse(response)) {
      throw new Error("Python detection returned an unexpected response shape");
    }

    return response;
  }

  async train(): Promise<unknown> {
    return this.runCommand("train", {
      manifestPath: env.datasetManifestFile,
      modelPath: env.pythonModelPath
    });
  }

  private async runCommand(command: "infer" | "train", payload: object): Promise<unknown> {
    return new Promise((resolve, reject) => {
      const child = spawn(env.pythonExecutable, [env.pythonDetectionScript, command], {
        cwd: process.cwd(),
        stdio: ["pipe", "pipe", "pipe"]
      });

      const stdoutChunks: Buffer[] = [];
      const stderrChunks: Buffer[] = [];
      const timeoutMs = command === "train" ? 600_000 : 300_000;
      const timeout = setTimeout(() => {
        child.kill();
        reject(new Error(`Python ${command} timed out`));
      }, timeoutMs);

      child.stdout.on("data", (chunk: Buffer) => stdoutChunks.push(chunk));
      child.stderr.on("data", (chunk: Buffer) => stderrChunks.push(chunk));
      child.on("error", (error) => {
        clearTimeout(timeout);
        reject(error);
      });

      child.on("close", (code) => {
        clearTimeout(timeout);
        const stdout = Buffer.concat(stdoutChunks).toString("utf8").trim();
        const stderr = Buffer.concat(stderrChunks).toString("utf8").trim();

        if (code !== 0) {
          reject(new Error(stderr || stdout || `Python ${command} failed with exit code ${code}`));
          return;
        }

        if (!stdout) {
          resolve({});
          return;
        }

        try {
          resolve(JSON.parse(stdout));
        } catch (error) {
          reject(
            new Error(
              `Python ${command} returned invalid JSON: ${
                error instanceof Error ? error.message : "parse error"
              }`
            )
          );
        }
      });

      child.stdin.write(JSON.stringify(payload));
      child.stdin.end();
    });
  }
}
