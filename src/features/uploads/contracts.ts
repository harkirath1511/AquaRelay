import { z } from "zod";

export const createUploadIntentSchema = z.object({
  observationId: z.uuid(),
  fileName: z.string().trim().min(1).max(255),
  contentType: z.enum(["image/jpeg", "image/png", "image/webp"]),
  byteSize: z.number().int().min(1).max(10_485_760),
  sha256: z.string().regex(/^[a-f0-9]{64}$/i),
});

export type CreateUploadIntentInput = z.infer<typeof createUploadIntentSchema>;

export interface UploadIntent {
  mediaId: string;
  objectPath: string;
  signedUrl: string;
  token: string;
  potentialDuplicate: boolean;
}
