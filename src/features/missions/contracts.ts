import { reportedLocationSchema, observationAnswersSchema, redactLocationText } from "@/features/locations/contracts";
import { z } from "zod";

import { missionTypeSchema } from "@/domain/model";
import { safetyFlagSchema } from "@/features/observations/contracts";

export const missionListQuerySchema = z.object({
    latitude: z.coerce.number().min(-90).max(90),
    longitude: z.coerce.number().min(-180).max(180),
    radiusMeters: z.coerce.number().int().min(1_000).max(5_000).default(5_000),
    type: missionTypeSchema.optional(),
    limit: z.coerce.number().int().min(1).max(25).default(25),
  }).strict();

export const submitMissionResponseSchema = z.object({
  location: reportedLocationSchema,
  observedAt: z.iso.datetime({ offset: true }),
  description: z.string().trim().min(1).max(2_000).transform(redactLocationText),
  answers: observationAnswersSchema,
  safetyFlags: z.array(safetyFlagSchema).max(6).default([]),
});

export type MissionListQuery = z.infer<typeof missionListQuerySchema>;
export type SubmitMissionResponseInput = z.infer<typeof submitMissionResponseSchema>;

export interface MissionResponseResult {
  incidentId: string;
  observationId: string;
  evidenceRevision: number;
  impactPoints: number;
  locationQualityFlag: "far_from_target" | "target_unknown" | null;
  locationQuality: "precise" | "approximate" | "low_accuracy" | "manually_selected" | "location_conflict";
  spatialFacts: Record<string, unknown>;
  replayed: boolean;
}
