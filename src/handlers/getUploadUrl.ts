import { APIGatewayProxyEventV2, APIGatewayProxyStructuredResultV2 } from "aws-lambda";
import { UploadService } from "../services/uploadService";
import { RequestValidationError } from "../utils/errors";
import { logger } from "../utils/logger";
import { badRequest, ok, serverError } from "../utils/response";
import { parseJson, validateUploadUrlInput } from "../utils/validate";
import { UploadUrlInput } from "../types/event";

const service = new UploadService();

export const handler = async (
  event: APIGatewayProxyEventV2
): Promise<APIGatewayProxyStructuredResultV2> => {
  try {
    const body = parseJson<UploadUrlInput>(event.body);
    const errors = validateUploadUrlInput(body);
    if (errors.length > 0) {
      return badRequest(errors.join("; "));
    }

    const result = await service.createUploadUrl(body!.contentType);
    return ok(result, "Upload URL generated");
  } catch (error) {
    if (error instanceof RequestValidationError) {
      return badRequest(error.message);
    }

    logger.error("Failed to generate upload url", error);
    return serverError();
  }
};
