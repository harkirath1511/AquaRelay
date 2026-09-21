import { z } from "zod";

import type { ObservationRepository } from "./repository";
import { submitObservationSchema } from "./contracts";

const idempotencyKeySchema = z.string().trim().min(8).max(200);

export class ObservationService {
  constructor(private readonly repository: ObservationRepository) {}

  async submit(userId: string, idempotencyKey: string, unknownInput: unknown) {
    const key = idempotencyKeySchema.parse(idempotencyKey);
    const input = submitObservationSchema.parse(unknownInput);
    return await this.repository.submit(userId, key, input);
  }
}
