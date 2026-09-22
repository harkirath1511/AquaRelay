import { reportedLocationSchema, observationAnswersSchema, redactLocationText } from "@/features/locations/contracts";
import { z } from "zod";

import { incidentCategorySchema } from "@/domain/model";

export const safetyFlagSchema = z.enum([
  "strong_fumes",
  "chemical_containers",
  "mass_wildlife_death",
  "flooding",
  "rapidly_changing_water",
  "unsafe_access",
]);

export const submitObservationSchema = z.object({
  streamId: z.uuid().nullable().optional(),
  category: incidentCategorySchema,
  location: reportedLocationSchema,
  locationLabel: z.string().trim().max(200).optional(),
  observedAt: z.iso.datetime({ offset: true }),
  description: z.string().trim().min(1).max(2_000).transform(redactLocationText),
  answers: observationAnswersSchema,
  safetyFlags: z.array(safetyFlagSchema).max(6).default([]),
});

export const incidentListQuerySchema = z.object({
  category: incidentCategorySchema.optional(),
  status: z
    .enum([
      "early_signal",
      "needs_verification",
      "community_supported_concern",
      "expert_review_recommended",
      "resolved_or_explained",
    ])
    .optional(),
  limit: z.coerce.number().int().min(1).max(100).default(25),
  offset: z.coerce.number().int().min(0).default(0),
});

export type SubmitObservationInput = z.infer<typeof submitObservationSchema>;
export type IncidentListQuery = z.infer<typeof incidentListQuerySchema>;

export interface SubmissionResult {
  incidentId: string;
  observationId: string;
  createdIncident: boolean;
  replayed: boolean;
}
