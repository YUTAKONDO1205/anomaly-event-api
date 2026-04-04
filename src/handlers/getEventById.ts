import { APIGatewayProxyEventV2, APIGatewayProxyStructuredResultV2 } from "aws-lambda";
import { EventService } from "../services/eventService";
import { logger } from "../utils/logger";
import { badRequest, notFound, ok, serverError } from "../utils/response";

const service = new EventService();

export const handler = async (
  event: APIGatewayProxyEventV2
): Promise<APIGatewayProxyStructuredResultV2> => {
  try {
    const eventId = event.pathParameters?.id?.trim();
    if (!eventId) {
      return badRequest("Missing event id");
    }

    const result = await service.getEventById(eventId);
    if (!result) {
      return notFound("Event not found");
    }

    return ok(result, "Event fetched");
  } catch (error) {
    logger.error("Failed to get event by id", error);
    return serverError();
  }
};
