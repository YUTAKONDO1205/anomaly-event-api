import { InvokeCommand, LambdaClient } from "@aws-sdk/client-lambda";
import { DetectionExplanation, DetectionLabel, DetectionModelInfo } from "../types/detection";
import { env } from "../utils/env";
import { DeepLearningPermanentError } from "../utils/errors";

interface AwsDeepLearningRequest {
  imageBase64: string;
  imageKey?: string;
  imageContentType?: string;
  targetLabel: string;
  threshold: number;
}

export interface AwsDeepLearningResponse {
  anomalyDetected: boolean;
  anomalyConfidence: number;
  labels: DetectionLabel[];
  provider: string;
  model: DetectionModelInfo;
  explanation: DetectionExplanation;
}

const lambda = new LambdaClient({ region: env.region });

function isAwsDeepLearningResponse(value: unknown): value is AwsDeepLearningResponse {
  if (!value || typeof value !== "object") {
    return false;
  }

  const candidate = value as Partial<AwsDeepLearningResponse>;
  const model = candidate.model as Partial<DetectionModelInfo> | undefined;
  const explanation = candidate.explanation as Partial<DetectionExplanation> | undefined;
  return (
    typeof candidate.anomalyDetected === "boolean" &&
    typeof candidate.anomalyConfidence === "number" &&
    Array.isArray(candidate.labels) &&
    typeof candidate.provider === "string" &&
    !!model &&
    typeof model.classifier === "string" &&
    typeof model.version === "string" &&
    !!explanation &&
    typeof explanation.summary === "string" &&
    Array.isArray(explanation.dominantSignals)
  );
}

export class AwsDeepLearningService {
  async detect(imageBytes: Uint8Array, options?: { imageKey?: string; imageContentType?: string }) {
    if (!env.awsDeepLearningFunctionName) {
      throw new DeepLearningPermanentError(
        "Missing environment variable: AWS_DEEP_LEARNING_FUNCTION_NAME"
      );
    }

    const payload: AwsDeepLearningRequest = {
      imageBase64: Buffer.from(imageBytes).toString("base64"),
      imageKey: options?.imageKey,
      imageContentType: options?.imageContentType,
      targetLabel: env.detectionTargetLabel,
      threshold: env.detectionMinConfidence
    };

    const response = await lambda.send(
      new InvokeCommand({
        FunctionName: env.awsDeepLearningFunctionName,
        InvocationType: "RequestResponse",
        Payload: Buffer.from(JSON.stringify(payload), "utf8")
      }),
      {
        // Allow a real (possibly cold-starting) PyTorch container inference to
        // complete: an 8s cap was shorter than a typical cold start, so the DL
        // model effectively never ran on cold invokes. Stay under the caller
        // Lambda's 30s timeout (template.yaml DetectImageFunction) to keep
        // headroom for the heuristic fallback.
        abortSignal: AbortSignal.timeout(25000)
      }
    );

    const responseText = response.Payload ? Buffer.from(response.Payload).toString("utf8").trim() : "";
    if (response.FunctionError) {
      throw new Error(`AWS deep learning invocation failed: ${responseText || response.FunctionError}`);
    }

    if (!responseText) {
      throw new Error("AWS deep learning invocation returned an empty response");
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(responseText);
    } catch (error) {
      throw new DeepLearningPermanentError(
        `AWS deep learning returned invalid JSON: ${error instanceof Error ? error.message : "parse error"}`
      );
    }

    if (!isAwsDeepLearningResponse(parsed)) {
      throw new DeepLearningPermanentError("AWS deep learning returned an unexpected response shape");
    }

    return parsed;
  }
}
