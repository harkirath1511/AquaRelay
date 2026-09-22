import type { EvidenceStatus } from "@/domain/model";

import type { AssessmentEvidence, AssessmentResult } from "./contracts";

const seriousSafetyFlags = new Set([
  "strong_fumes",
  "chemical_containers",
  "mass_wildlife_death",
  "flooding",
  "rapidly_changing_water",
]);

export interface EvidenceDecision {
  status: EvidenceStatus;
  reasons: string[];
  pauseMissions: boolean;
}

export function evaluateEvidence(
  evidence: AssessmentEvidence,
  assessment: AssessmentResult,
): EvidenceDecision {
  const usable = evidence.observations.filter(
    (observation) => !observation.isPotentialDuplicate && !observation.invalidatedAt
      && !observation.locationQualityFlag
      && (observation.locationQuality === "precise" || observation.locationQuality === "approximate"),
  );
  const contributorCount = new Set(usable.map((observation) => observation.authorId)).size;
  const hasSpatialComparison = usable.some((observation) =>
    observation.spatialFacts?.insideTargetRadius === true && (
      (observation.missionType === "upstream_comparison" && observation.spatialFacts.flowRelationship === "upstream")
      || (observation.missionType === "downstream_comparison" && observation.spatialFacts.flowRelationship === "downstream")
    ),
  );
  const hasPersistence = usable.some((observation) => observation.missionType === "repeat_observation"
    && observation.spatialFacts?.insideTargetRadius === true);
  const hasSeriousSafetyFlag = [...assessment.safetyFlags, ...evidence.observations.flatMap((o) => o.safetyFlags)]
    .some((flag) => seriousSafetyFlags.has(flag));

  if (hasSeriousSafetyFlag) {
    return {
      status: "expert_review_recommended",
      reasons: ["A reported safety hazard requires human review; community missions are paused."],
      pauseMissions: true,
    };
  }

  if (assessment.contradictions.length > 0) {
    return {
      status: "needs_verification",
      reasons: ["Material contradictions remain and require further observation."],
      pauseMissions: false,
    };
  }

  if (contributorCount >= 2 && hasSpatialComparison && hasPersistence) {
    return {
      status: "expert_review_recommended",
      reasons: ["Independent, spatial, and repeat evidence supports expert review."],
      pauseMissions: false,
    };
  }

  if (contributorCount >= 2 && assessment.observedFeatures.length > 0) {
    return {
      status: "community_supported_concern",
      reasons: ["Relevant evidence was supplied by at least two distinct contributors."],
      pauseMissions: false,
    };
  }

  return {
    status: "needs_verification",
    reasons: usable.length < evidence.observations.length
      ? ["Some evidence has uncertain or conflicting location information and needs review."]
      : assessment.missingEvidence.length
      ? assessment.missingEvidence.slice(0, 5)
      : ["Independent verification is still needed."],
    pauseMissions: false,
  };
}
