import { randomUUID } from "node:crypto";

import type { SupabaseClient } from "@supabase/supabase-js";

import { sanitizeImage } from "./image";
import type { CreateUploadIntentInput, UploadIntent } from "./contracts";

const bucket = "observation-media";
const extensionByMimeType = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
} as const;

export class UploadLimitError extends Error {
  readonly status = 409;

  constructor() {
    super("An observation can contain at most three photographs");
    this.name = "UploadLimitError";
  }
}

export class UploadRepository {
  constructor(private readonly admin: SupabaseClient) {}

  async createIntent(userId: string, input: CreateUploadIntentInput): Promise<UploadIntent> {
    const { data: observation, error: observationError } = await this.admin
      .from("observations")
      .select("id")
      .eq("id", input.observationId)
      .eq("author_id", userId)
      .maybeSingle();
    if (observationError) throw new Error(`Observation lookup failed: ${observationError.message}`);
    if (!observation) throw new Error("Observation not found or not owned by the current user");

    const { count, error: countError } = await this.admin
      .from("media")
      .select("id", { count: "exact", head: true })
      .eq("observation_id", input.observationId)
      .neq("processing_state", "rejected");
    if (countError) throw new Error(`Media count failed: ${countError.message}`);
    if ((count ?? 0) >= 3) throw new UploadLimitError();

    const { count: matchingHashes, error: hashError } = await this.admin
      .from("media")
      .select("id", { count: "exact", head: true })
      .eq("sha256", input.sha256.toLowerCase())
      .eq("processing_state", "ready");
    if (hashError) throw new Error(`Duplicate check failed: ${hashError.message}`);

    const mediaId = randomUUID();
    const extension = extensionByMimeType[input.contentType];
    const objectPath = `${userId}/${mediaId}.${extension}`;
    const { error: insertError } = await this.admin.from("media").insert({
      id: mediaId,
      observation_id: input.observationId,
      owner_id: userId,
      object_path: objectPath,
      sha256: input.sha256.toLowerCase(),
      mime_type: input.contentType,
      byte_size: input.byteSize,
      processing_state: "pending",
    });
    if (insertError) throw new Error(`Media registration failed: ${insertError.message}`);

    const { data: upload, error: uploadError } = await this.admin.storage
      .from(bucket)
      .createSignedUploadUrl(objectPath);
    if (uploadError) {
      await this.admin.from("media").delete().eq("id", mediaId);
      throw new Error(`Upload URL creation failed: ${uploadError.message}`);
    }

    return {
      mediaId,
      objectPath,
      signedUrl: upload.signedUrl,
      token: upload.token,
      potentialDuplicate: (matchingHashes ?? 0) > 0,
    };
  }

  async complete(userId: string, mediaId: string) {
    const { data: media, error: mediaError } = await this.admin
      .from("media")
      .select("id, observation_id, object_path, processing_state")
      .eq("id", mediaId)
      .eq("owner_id", userId)
      .maybeSingle();
    if (mediaError) throw new Error(`Media lookup failed: ${mediaError.message}`);
    if (!media) throw new Error("Media upload not found or not owned by the current user");
    if (media.processing_state === "ready") return { mediaId, state: "ready", replayed: true };
    if (media.processing_state === "rejected") throw new Error("Media upload was rejected");

    try {
      const { data: object, error: downloadError } = await this.admin.storage
        .from(bucket)
        .download(media.object_path);
      if (downloadError) throw new Error(`Upload download failed: ${downloadError.message}`);
      if (object.size > 10_485_760) throw new Error("Uploaded file is too large");

      const sanitized = await sanitizeImage(Buffer.from(await object.arrayBuffer()));
      const { error: replaceError } = await this.admin.storage
        .from(bucket)
        .upload(media.object_path, sanitized.buffer, {
          contentType: sanitized.contentType,
          upsert: true,
        });
      if (replaceError) throw new Error(`Sanitized upload failed: ${replaceError.message}`);

      const { count: duplicateCount, error: duplicateError } = await this.admin
        .from("media")
        .select("id", { count: "exact", head: true })
        .eq("sha256", sanitized.sha256)
        .eq("processing_state", "ready")
        .neq("id", mediaId);
      if (duplicateError) throw new Error(`Duplicate check failed: ${duplicateError.message}`);

      const { error: updateError } = await this.admin
        .from("media")
        .update({
          sha256: sanitized.sha256,
          mime_type: sanitized.contentType,
          byte_size: sanitized.buffer.byteLength,
          processing_state: "ready",
        })
        .eq("id", mediaId);
      if (updateError) throw new Error(`Media finalization failed: ${updateError.message}`);

      if ((duplicateCount ?? 0) > 0) {
        const { error: observationError } = await this.admin
          .from("observations")
          .update({ is_potential_duplicate: true })
          .eq("id", media.observation_id);
        if (observationError) throw new Error(`Duplicate flag failed: ${observationError.message}`);
      }

      return {
        mediaId,
        state: "ready",
        replayed: false,
        potentialDuplicate: (duplicateCount ?? 0) > 0,
      };
    } catch (error) {
      await this.admin.from("media").update({ processing_state: "rejected" }).eq("id", mediaId);
      await this.admin.storage.from(bucket).remove([media.object_path]);
      throw error;
    }
  }
}
