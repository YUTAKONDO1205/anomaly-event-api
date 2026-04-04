import { APIGatewayProxyEventV2, APIGatewayProxyStructuredResultV2 } from "aws-lambda";
import { DashboardService } from "../services/dashboardService";
import { logger } from "../utils/logger";
import { ok, serverError } from "../utils/response";

const service = new DashboardService();

export const handler = async (
  _event: APIGatewayProxyEventV2
): Promise<APIGatewayProxyStructuredResultV2> => {
  try {
    const result = await service.getSnapshot();
    return ok(result, "Dashboard snapshot fetched");
  } catch (error) {
    logger.error("Failed to get dashboard snapshot", error);
    return serverError();
  }
};
