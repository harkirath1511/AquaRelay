import { z } from "zod";

import { coordinatesSchema, missionTypeSchema } from "@/domain/model";
import { safetyFlagSchema } from "@/features/observations/contracts";

export const missionListQuerySchema = z
  .object({
    latitude: z.coerce.number().min(-90).max(90).optional(),
    longitude: z.coerce.number().min(-180).max(180).optional(),
    radiusMeters: z.coerce.number().int().min(100).max(20_000).default(5_000),
    type: missionTypeSchema.optional(),
    limit: z.coerce.number().int().min(1).max(100).default(25),
  })
  .refine(
    (value) => (value.latitude === undefined) === (value.longitude === undefined),
    { message: "latitude and longitude must be provided together" },
  );

export const submitMissionResponseSchema = z.object({
  location: coordinatesSchema,
  observedAt: z.iso.datetime({ offset: true }),
  description: z.string().trim().min(1).max(2_000),
  answers: z.record(z.string(), z.unknown()).default({}),
  safetyFlags: z.array(safetyFlagSchema).max(6).default([]),
});

export type MissionListQuery = z.infer<typeof missionListQuerySchema>;
export type SubmitMissionResponseInput = z.infer<typeof submitMissionResponseSchema>;

export interface MissionResponseResult {
  incidentId: string;
  observationId: string;
  evidenceRevision: number;
  impactPoints: number;
  replayed: boolean;
}
