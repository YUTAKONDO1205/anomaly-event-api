import { APIGatewayProxyEventV2, APIGatewayProxyStructuredResultV2 } from "aws-lambda";
import { EventService } from "../services/eventService";
import { ListEventsQuery } from "../types/event";
import { logger } from "../utils/logger";
import { badRequest, ok, serverError } from "../utils/response";
import { validateListEventsQuery } from "../utils/validate";

const service = new EventService();

export const handler = async (
  event: APIGatewayProxyEventV2
): Promise<APIGatewayProxyStructuredResultV2> => {
  try {
    const rawFilters = {
      status: event.queryStringParameters?.status,
      deviceId: event.queryStringParameters?.deviceId?.trim() || undefined
    };
    const errors = validateListEventsQuery(rawFilters);

    if (errors.length > 0) {
      return badRequest(errors.join("; "));
    }

    const filters: ListEventsQuery = {
      status: rawFilters.status as ListEventsQuery["status"],
      deviceId: rawFilters.deviceId
    };

    const result = await service.getEvents(filters);
    return ok(result, "Events fetched");
  } catch (error) {
    logger.error("Failed to get events", error);
    return serverError();
  }
};
