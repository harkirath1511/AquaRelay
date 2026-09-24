import { redactLocationText } from "@/features/locations/contracts";
import { z } from "zod";

import { missionTypeSchema } from "@/domain/model";
import { safetyFlagSchema } from "@/features/observations/contracts";

const evidenceLinkedTextSchema = z.object({
  text: z.string().trim().min(1).max(1_000).transform(redactLocationText),
  evidenceReferences: z.array(z.uuid()).max(20),
});

export const assessmentResultSchema = z.object({
  observedFeatures: z.array(evidenceLinkedTextSchema).max(20),
  qualityIssues: z.array(evidenceLinkedTextSchema).max(20),
  missingEvidence: z.array(z.string().trim().min(1).max(500).transform(redactLocationText)).max(20),
  possibleExplanations: z.array(evidenceLinkedTextSchema).max(10),
  contradictions: z.array(evidenceLinkedTextSchema).max(20),
  suggestedMissionTypes: z.array(missionTypeSchema).max(7),
  safetyFlags: z.array(safetyFlagSchema).max(6),
  summary: evidenceLinkedTextSchema,
});

export type AssessmentResult = z.infer<typeof assessmentResultSchema>;

export interface AssessmentEvidence {
  incidentId: string;
  category: string;
  evidenceRevision: number;
  streamDirectionVerified?: boolean;
  observations: Array<{
    id: string;
    authorId: string;
    missionType: string | null;
    missionTargetVerified?: boolean;
    observedAt: string;
    description: string;
    answers: Record<string, unknown>;
    safetyFlags: string[];
    isPotentialDuplicate: boolean;
    locationQualityFlag?: string | null;
    locationQuality?: "precise" | "approximate" | "low_accuracy" | "manually_selected" | "location_conflict";
    locationConflicts?: string[];
    spatialFacts?: {
      distanceFromOrigin: "within_100m" | "within_250m" | "within_1km" | "over_1km" | "unknown";
      streamRelationship: "same" | "different" | "unknown";
      flowRelationship: "upstream" | "downstream" | "same_reach" | "unknown";
      insideTargetRadius: boolean | null;
    };
    invalidatedAt: string | null;
    media: Array<{
      id: string;
      mimeType: "image/jpeg";
      data: string;
    }>;
  }>;
}

export interface AssessmentClaim {
  assessmentId: string;
  evidenceRevision: number;
}
