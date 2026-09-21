import { z } from "zod";

import { createUploadIntentSchema } from "./contracts";
import { UploadRepository } from "./repository";

export class UploadService {
  constructor(private readonly repository: UploadRepository) {}

  createIntent(userId: string, unknownInput: unknown) {
    return this.repository.createIntent(userId, createUploadIntentSchema.parse(unknownInput));
  }

  complete(userId: string, mediaId: string) {
    return this.repository.complete(userId, z.uuid().parse(mediaId));
  }
}
