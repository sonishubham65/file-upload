import "@aws-sdk/signature-v4-crt";
import {
  S3Client,
  CreateMultipartUploadCommand,
  UploadPartCommand,
  CompleteMultipartUploadCommand,
  AbortMultipartUploadCommand,
  ListPartsCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

const REGION = process.env.AWS_REGION;
const MAX_FILE_SIZE = 50 * 1024 * 1024;
const MRAP_ARN =
  "arn:aws:s3::978902358863:accesspoint/mhm5yi1qoc9yy.mrap";

const s3Client = new S3Client({
  region: REGION,
  useArnRegion: false,
});

export const handler = async (event) => {
  try {
    console.log(`event: ${JSON.stringify(event)}`);
    const path = event.rawPath || event.path;
    const body = event.body ? JSON.parse(event.body) : {};

    // ===============================
    // 1️⃣ CREATE MULTIPART UPLOAD
    // ===============================
    if (path.endsWith("/create")) {
      const { fileName, contentType } = body;

      if (!fileName || !fileSize) {
        return response(400, {
          message: "fileName and fileSize are required",
        });
      }

      if (fileSize > MAX_FILE_SIZE) {
        return response(400, {
          message: "File exceeds maximum allowed size (50MB)",
        });
      }

      const command = new CreateMultipartUploadCommand({
        Bucket: MRAP_ARN,
        Key: `uploads/${fileName}`,
        ContentType: contentType || "application/octet-stream",
      });

      const result = await s3Client.send(command);

      return response(200, {
        uploadId: result.UploadId,
        key: result.Key,
        region: REGION,
      });
    }

    // ===============================
    // 2️⃣ GET SIGNED URL FOR PART
    // ===============================
    if (path.endsWith("/part")) {
      const { key, uploadId, partNumber } = body;

      if (!key || !uploadId || !partNumber) {
        return response(400, {
          message: "key, uploadId and partNumber are required",
        });
      }

      const command = new UploadPartCommand({
        Bucket: MRAP_ARN,
        Key: key,
        UploadId: uploadId,
        PartNumber: partNumber,
      });

      const signedUrl = await getSignedUrl(s3Client, command, {
        expiresIn: 300,
      });

      return response(200, { signedUrl });
    }

    // ===============================
    // 3️⃣ LIST PARTS (🔥 RESUME SUPPORT)
    // ===============================
    if (path.endsWith("/list-parts")) {
      const { key, uploadId } = body;

      if (!key || !uploadId) {
        return response(400, {
          message: "key and uploadId are required",
        });
      }

      const command = new ListPartsCommand({
        Bucket: MRAP_ARN,
        Key: key,
        UploadId: uploadId,
      });

      const result = await s3Client.send(command);

      const parts =
        result.Parts?.map((part) => ({
          PartNumber: part.PartNumber,
          ETag: part.ETag,
        })) || [];

      return response(200, { parts });
    }

    // ===============================
    // 4️⃣ COMPLETE MULTIPART UPLOAD
    // ===============================
    if (path.endsWith("/complete")) {
      const { key, uploadId, parts } = body;

      if (!key || !uploadId || !parts) {
        return response(400, {
          message: "key, uploadId and parts are required",
        });
      }

      const command = new CompleteMultipartUploadCommand({
        Bucket: MRAP_ARN,
        Key: key,
        UploadId: uploadId,
        MultipartUpload: {
          Parts: parts,
        },
      });

      const result = await s3Client.send(command);

      return response(200, {
        message: "Upload completed",
        location: result.Location,
      });
    }

    // ===============================
    // 5️⃣ ABORT
    // ===============================
    if (path.endsWith("/abort")) {
      const { key, uploadId } = body;

      const command = new AbortMultipartUploadCommand({
        Bucket: MRAP_ARN,
        Key: key,
        UploadId: uploadId,
      });

      await s3Client.send(command);

      return response(200, { message: "Upload aborted" });
    }

    return response(404, { message: "Route not found" });
  } catch (error) {
    console.error("Error:", error);
    return response(500, { message: "Internal server error" });
  }
};

// ===============================
// Helper
// ===============================
function response(statusCode, body) {
  return {
    statusCode,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "https://aarakshit.com",
      "Access-Control-Allow-Headers": "Content-Type",
      "Access-Control-Allow-Methods": "OPTIONS,POST",
    },
    body: JSON.stringify(body),
  };
}
