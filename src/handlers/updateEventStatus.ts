import { APIGatewayProxyEventV2, APIGatewayProxyStructuredResultV2 } from "aws-lambda";
import { EventService } from "../services/eventService";
import { UpdateStatusInput } from "../types/event";
import { InvalidStatusTransitionError, RequestValidationError } from "../utils/errors";
import { logger } from "../utils/logger";
import { badRequest, conflict, notFound, ok, serverError } from "../utils/response";
import { parseJson, validateUpdateStatusInput } from "../utils/validate";

const service = new EventService();

export const handler = async (
  event: APIGatewayProxyEventV2
): Promise<APIGatewayProxyStructuredResultV2> => {
  try {
    const eventId = event.pathParameters?.id?.trim();
    if (!eventId) {
      return badRequest("Missing event id");
    }

    const body = parseJson<Partial<UpdateStatusInput>>(event.body);
    const errors = validateUpdateStatusInput(body);
    if (errors.length > 0) {
      return badRequest(errors.join("; "));
    }

    const result = await service.updateStatus(eventId, (body as UpdateStatusInput).status);
    if (!result) {
      return notFound("Event not found");
    }

    return ok(result, "Event status updated");
  } catch (error) {
    if (error instanceof InvalidStatusTransitionError) {
      return conflict(error.message);
    }

    if (error instanceof RequestValidationError) {
      return badRequest(error.message);
    }

    logger.error("Failed to update event status", error);
    return serverError();
  }
};
