import { describe, expect, it } from "vitest";

import type { AssessmentEvidence, AssessmentResult } from "./contracts";
import { evaluateEvidence } from "./rules";

const observationId = "5f20cb5c-2f8a-4f4a-91ae-38407808db52";
const baseEvidence: AssessmentEvidence = {
  incidentId: "incident",
  category: "foam",
  evidenceRevision: 1,
  observations: [
    {
      id: observationId,
      authorId: "user-one",
      missionType: null,
      observedAt: "2026-09-21T10:00:00Z",
      description: "White foam",
      answers: {},
      safetyFlags: [],
      isPotentialDuplicate: false,
      invalidatedAt: null,
      media: [],
    },
  ],
};
const baseAssessment: AssessmentResult = {
  observedFeatures: [{ text: "White material was reported", evidenceReferences: [observationId] }],
  qualityIssues: [],
  missingEvidence: ["An upstream comparison is missing"],
  possibleExplanations: [],
  contradictions: [],
  suggestedMissionTypes: ["upstream_comparison"],
  safetyFlags: [],
  summary: { text: "The report remains uncertain", evidenceReferences: [observationId] },
};

describe("evaluateEvidence", () => {
  it("does not count far-away responses as independent support but preserves hazards", () => {
    const evidence: AssessmentEvidence = {
      ...baseEvidence,
      observations: [...baseEvidence.observations, {
        ...baseEvidence.observations[0], authorId: "user-two", locationQualityFlag: "far_from_target",
      }],
    };
    expect(evaluateEvidence(evidence, baseAssessment).status).toBe("needs_verification");
    evidence.observations[1].safetyFlags = ["strong_fumes"];
    expect(evaluateEvidence(evidence, baseAssessment).pauseMissions).toBe(true);
  });
  it("routes serious safety signals directly to review and pauses missions", () => {
    const decision = evaluateEvidence(baseEvidence, {
      ...baseAssessment,
      safetyFlags: ["strong_fumes"],
    });
    expect(decision.status).toBe("expert_review_recommended");
    expect(decision.pauseMissions).toBe(true);
  });

  it("keeps material contradictions in verification", () => {
    const decision = evaluateEvidence(baseEvidence, {
      ...baseAssessment,
      contradictions: [{ text: "Later observation differs", evidenceReferences: [observationId] }],
    });
    expect(decision.status).toBe("needs_verification");
  });

  it("requires distinct contributors and spatial plus repeat evidence for expert review", () => {
    const evidence: AssessmentEvidence = {
      ...baseEvidence,
      observations: [
        ...baseEvidence.observations,
        { ...baseEvidence.observations[0], id: "0fd4443f-29c7-4431-b515-734e75ef19d7", authorId: "user-two", missionType: "upstream_comparison" },
        { ...baseEvidence.observations[0], id: "858e6787-119f-42f5-a9d5-8b62b8dcf85c", authorId: "user-three", missionType: "repeat_observation" },
      ],
    };
    expect(evaluateEvidence(evidence, baseAssessment).status).toBe("expert_review_recommended");
  });

  it("does not count duplicate observations as independent support", () => {
    const evidence: AssessmentEvidence = {
      ...baseEvidence,
      observations: [
        ...baseEvidence.observations,
        { ...baseEvidence.observations[0], id: "0fd4443f-29c7-4431-b515-734e75ef19d7", authorId: "user-two", isPotentialDuplicate: true },
      ],
    };
    expect(evaluateEvidence(evidence, baseAssessment).status).toBe("needs_verification");
  });
});
