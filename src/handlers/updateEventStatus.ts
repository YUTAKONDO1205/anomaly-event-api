import { APIGatewayProxyEventV2, APIGatewayProxyStructuredResultV2 } from "aws-lambda";
import { EventStatus } from "../models/event";
import { EventService } from "../services/eventService";
import { RequestValidationError } from "../utils/errors";
import { logger } from "../utils/logger";
import { badRequest, notFound, ok, serverError } from "../utils/response";
import { parseJson, validateUpdateStatusInput } from "../utils/validate";

const service = new EventService();

export const handler = async (
  event: APIGatewayProxyEventV2
): Promise<APIGatewayProxyStructuredResultV2> => {
  try {
    const eventId = event.pathParameters?.id?.trim();
    const body = parseJson<{ status?: EventStatus }>(event.body);

    if (!eventId) {
      return badRequest("Missing event id");
    }

    const errors = validateUpdateStatusInput(body);
    if (errors.length > 0) {
      return badRequest(errors.join("; "));
    }

    const result = await service.updateStatus(eventId, body!.status);
    if (!result) {
      return notFound("Event not found");
    }

    return ok(result, "Event status updated");
  } catch (error) {
    if (error instanceof RequestValidationError) {
      return badRequest(error.message);
    }

    logger.error("Failed to update event status", error);
    return serverError();
  }
};
