import { z } from "zod";

export const incidentCategories = [
  "foam",
  "discolouration",
  "litter",
  "wildlife",
  "odour",
  "flow",
  "erosion",
  "other",
] as const;

export const evidenceStatuses = [
  "early_signal",
  "needs_verification",
  "community_supported_concern",
  "expert_review_recommended",
  "resolved_or_explained",
] as const;

export const safetyStates = ["normal", "review_required", "missions_paused"] as const;

export const missionTypes = [
  "upstream_comparison",
  "downstream_comparison",
  "repeat_observation",
  "clearer_photo",
  "unaffected_comparison",
  "safe_viewpoint",
  "unsafe_access_report",
] as const;

export const incidentCategorySchema = z.enum(incidentCategories);
export const evidenceStatusSchema = z.enum(evidenceStatuses);
export const safetyStateSchema = z.enum(safetyStates);
export const missionTypeSchema = z.enum(missionTypes);

export const coordinatesSchema = z.object({
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
});

export type IncidentCategory = z.infer<typeof incidentCategorySchema>;
export type EvidenceStatus = z.infer<typeof evidenceStatusSchema>;
export type SafetyState = z.infer<typeof safetyStateSchema>;
export type MissionType = z.infer<typeof missionTypeSchema>;
