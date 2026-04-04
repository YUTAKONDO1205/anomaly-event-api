import { APIGatewayProxyEventV2, APIGatewayProxyStructuredResultV2 } from "aws-lambda";
import { DetectionService } from "../services/detectionService";
import { DetectImageInput } from "../types/detection";
import { RequestValidationError } from "../utils/errors";
import { logger } from "../utils/logger";
import { badRequest, ok, serverError } from "../utils/response";
import { parseJson, validateDetectImageInput } from "../utils/validate";

const service = new DetectionService();

export const handler = async (
  event: APIGatewayProxyEventV2
): Promise<APIGatewayProxyStructuredResultV2> => {
  try {
    const body = parseJson<DetectImageInput>(event.body);
    const errors = validateDetectImageInput(body);
    if (errors.length > 0) {
      return badRequest(errors.join("; "));
    }

    const result = await service.detectAndCreateEvent(body as DetectImageInput);
    const message = result.anomalyDetected
      ? "Anomaly detected and event created"
      : "No anomaly detected";

    return ok(result, message);
  } catch (error) {
    if (error instanceof RequestValidationError) {
      return badRequest(error.message);
    }

    logger.error("Failed to detect anomaly", error);
    return serverError();
  }
};
