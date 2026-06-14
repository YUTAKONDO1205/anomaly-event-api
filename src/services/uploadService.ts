import { randomUUID } from "crypto";
import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { UploadContentType } from "../types/event";
import { env } from "../utils/env";
import { RequestValidationError } from "../utils/errors";

const s3 = new S3Client({ region: env.region });
const extensionByContentType: Record<UploadContentType, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp"
};

export function buildImageObjectKey(contentType: UploadContentType): string {
  const extension = extensionByContentType[contentType];
  if (!extension) {
    throw new RequestValidationError(`Unsupported content type: ${contentType}`);
  }
  return `images/${randomUUID()}.${extension}`;
}

export class UploadService {
  async createUploadUrl(contentType: UploadContentType, baseUrl?: string) {
    const key = buildImageObjectKey(contentType);

    if (env.storageMode === "local") {
      return {
        key,
        bucket: env.eventImagesBucket,
        contentType,
        uploadUrl: baseUrl ? `${baseUrl}/uploads/${encodeURIComponent(key)}` : null,
        expiresIn: 0,
        uploadMode: "inline"
      };
    }

    const command = new PutObjectCommand({
      Bucket: env.eventImagesBucket,
      Key: key,
      ContentType: contentType
    });

    const uploadUrl = await getSignedUrl(s3, command, { expiresIn: 300 });

    return {
      key,
      bucket: env.eventImagesBucket,
      contentType,
      uploadUrl,
      expiresIn: 300,
      uploadMode: "presigned"
    };
  }
}
