import { APIGatewayProxyEventV2, APIGatewayProxyStructuredResultV2 } from "aws-lambda";
import { env } from "../utils/env";
import { logger } from "../utils/logger";
import { badRequest, ok, serverError } from "../utils/response";
import { resetLocalEventStorage } from "../utils/localStore";

export const handler = async (
  _event: APIGatewayProxyEventV2
): Promise<APIGatewayProxyStructuredResultV2> => {
  try {
    if (env.storageMode !== "local") {
      return badRequest("Local database reset is only available in local mode");
    }

    const result = await resetLocalEventStorage();
    return ok(
      {
        ...result,
        clearedAt: new Date().toISOString()
      },
      "Local database cleared"
    );
  } catch (error) {
    logger.error("Failed to reset local database", error);
    return serverError();
  }
};
