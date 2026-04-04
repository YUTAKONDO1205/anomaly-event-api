import { APIGatewayProxyEventV2, APIGatewayProxyStructuredResultV2 } from "aws-lambda";
import { EventService } from "../services/eventService";
import { logger } from "../utils/logger";
import { badRequest, ok, serverError } from "../utils/response";
import { validateListEventsQuery } from "../utils/validate";

const service = new EventService();

export const handler = async (
  event: APIGatewayProxyEventV2
): Promise<APIGatewayProxyStructuredResultV2> => {
  try {
    const filters = {
      status: event.queryStringParameters?.status,
      deviceId: event.queryStringParameters?.deviceId?.trim() || undefined
    };
    const errors = validateListEventsQuery(filters);

    if (errors.length > 0) {
      return badRequest(errors.join("; "));
    }

    const result = await service.getEvents(filters);
    return ok(result, "Events fetched");
  } catch (error) {
    logger.error("Failed to get events", error);
    return serverError();
  }
};
