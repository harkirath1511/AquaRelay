import { z } from "zod";

import { createReviewSchema } from "./contracts";
import type { ReviewRepository } from "./repository";

const idSchema = z.uuid();

export class ReviewService {
  constructor(private readonly repository: ReviewRepository) {}

  async create(incidentId: string, reviewerId: string, unknownInput: unknown) {
    return await this.repository.create(
      idSchema.parse(incidentId),
      reviewerId,
      createReviewSchema.parse(unknownInput),
    );
  }
}
