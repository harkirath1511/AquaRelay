import { z } from "zod";

import { missionListQuerySchema, submitMissionResponseSchema } from "./contracts";
import type { MissionRepository } from "./repository";

const identifierSchema = z.uuid();
const idempotencyKeySchema = z.string().trim().min(8).max(200);

export class MissionService {
  constructor(private readonly repository: MissionRepository) {}

  async list(userId: string, unknownQuery: unknown) {
    return await this.repository.list(userId, missionListQuerySchema.parse(unknownQuery));
  }

  async respond(
    missionId: string,
    userId: string,
    idempotencyKey: string,
    unknownInput: unknown,
  ) {
    return await this.repository.respond(
      identifierSchema.parse(missionId),
      userId,
      idempotencyKeySchema.parse(idempotencyKey),
      submitMissionResponseSchema.parse(unknownInput),
    );
  }
}
