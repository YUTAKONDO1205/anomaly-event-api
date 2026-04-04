import { APIGatewayProxyEventV2, APIGatewayProxyStructuredResultV2 } from "aws-lambda";
import { EventService } from "../services/eventService";
import { RequestValidationError } from "../utils/errors";
import { logger } from "../utils/logger";
import { badRequest, created, serverError } from "../utils/response";
import { parseJson, validateCreateEventInput } from "../utils/validate";
import { CreateEventInput } from "../models/event";

const service = new EventService();

export const handler = async (
  event: APIGatewayProxyEventV2
): Promise<APIGatewayProxyStructuredResultV2> => {
  try {
    const body = parseJson<CreateEventInput>(event.body);
    const errors = validateCreateEventInput(body);
    if (errors.length > 0) {
      return badRequest(errors.join("; "));
    }

    const result = await service.createEvent(body as CreateEventInput);
    return created(result, "Event created");
  } catch (error) {
    if (error instanceof RequestValidationError) {
      return badRequest(error.message);
    }

    logger.error("Failed to create event", error);
    return serverError();
  }
};
