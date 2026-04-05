import path from "node:path";
import { GetObjectCommand, NoSuchKey, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { APIGatewayProxyEventV2, APIGatewayProxyStructuredResultV2 } from "aws-lambda";
import { readLocalUpload } from "../utils/localStore";
import { env } from "../utils/env";
import { logger } from "../utils/logger";
import { badRequest, notFound, serverError } from "../utils/response";

const s3 = new S3Client({ region: env.region });

function getImageKey(event: APIGatewayProxyEventV2): string | null {
  const rawValue = event.pathParameters?.imageKey || event.pathParameters?.proxy;
  if (!rawValue) {
    return null;
  }

  try {
    const decoded = decodeURIComponent(rawValue).trim();
    return decoded || null;
  } catch {
    return rawValue.trim() || null;
  }
}

function getContentType(imageKey: string): string {
  const extension = path.extname(imageKey).toLowerCase();

  switch (extension) {
    case ".jpg":
    case ".jpeg":
      return "image/jpeg";
    case ".png":
      return "image/png";
    case ".webp":
      return "image/webp";
    default:
      return "application/octet-stream";
  }
}

export const handler = async (
  event: APIGatewayProxyEventV2
): Promise<APIGatewayProxyStructuredResultV2> => {
  const imageKey = getImageKey(event);
  if (!imageKey) {
    return badRequest("imageKey path parameter is required");
  }

  try {
    if (env.storageMode === "local") {
      const bytes = await readLocalUpload(imageKey);
      return {
        statusCode: 200,
        headers: {
          "Content-Type": getContentType(imageKey),
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Headers": "Content-Type",
          "Access-Control-Allow-Methods": "GET,OPTIONS",
          "Cache-Control": "public, max-age=60"
        },
        body: Buffer.from(bytes).toString("base64"),
        isBase64Encoded: true
      };
    }

    const location = await getSignedUrl(
      s3,
      new GetObjectCommand({
        Bucket: env.eventImagesBucket,
        Key: imageKey
      }),
      { expiresIn: 300 }
    );

    return {
      statusCode: 302,
      headers: {
        Location: location,
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "Content-Type",
        "Access-Control-Allow-Methods": "GET,OPTIONS",
        "Cache-Control": "no-store"
      },
      body: ""
    };
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    const name = (error as { name?: string }).name;

    if (code === "ENOENT" || name === "NoSuchKey" || error instanceof NoSuchKey) {
      return notFound("Image not found");
    }

    logger.error("Failed to load uploaded image", { imageKey, error });
    return serverError();
  }
};
