import { describe, expect, it, vi } from "vitest";

import type { AssessmentEvidence, AssessmentResult } from "./contracts";
import type { AssessmentProvider } from "./provider";
import type { AssessmentRepository } from "./repository";
import { AssessmentService } from "./service";

const observationId = "5f20cb5c-2f8a-4f4a-91ae-38407808db52";
const evidence: AssessmentEvidence = {
  incidentId: "incident-id",
  category: "foam",
  evidenceRevision: 2,
  observations: [{
    id: observationId,
    authorId: "user-id",
    missionType: null,
    observedAt: "2026-09-21T10:00:00Z",
    description: "White foam",
    answers: {},
    safetyFlags: [],
    isPotentialDuplicate: false,
    invalidatedAt: null,
    media: [],
  }],
};
const result: AssessmentResult = {
  observedFeatures: [{ text: "White foam was reported", evidenceReferences: [observationId] }],
  qualityIssues: [],
  missingEvidence: ["Upstream comparison"],
  possibleExplanations: [],
  contradictions: [],
  suggestedMissionTypes: ["upstream_comparison"],
  safetyFlags: [],
  summary: { text: "Evidence is incomplete", evidenceReferences: [observationId] },
};

function setup(providerResult: AssessmentResult = result) {
  const repository: AssessmentRepository = {
    claim: vi.fn().mockResolvedValue({ assessmentId: "assessment-id", evidenceRevision: 2 }),
    loadEvidence: vi.fn().mockResolvedValue(evidence),
    complete: vi.fn().mockResolvedValue(undefined),
    fail: vi.fn().mockResolvedValue(undefined),
  };
  const provider: AssessmentProvider = {
    providerName: "test",
    modelName: "test-model",
    assess: vi.fn().mockResolvedValue(providerResult),
  };
  return { repository, provider, service: new AssessmentService(repository, provider) };
}

describe("AssessmentService", () => {
  it("validates, evaluates, and persists a provider result", async () => {
    const { repository, service } = setup();
    const response = await service.assess("incident-id", "user-id");
    expect(response.decision.status).toBe("needs_verification");
    expect(repository.complete).toHaveBeenCalledOnce();
    expect(repository.fail).not.toHaveBeenCalled();
  });

  it("rejects invented evidence references and records failure", async () => {
    const { repository, service } = setup({
      ...result,
      summary: {
        text: "Invented source",
        evidenceReferences: ["2ad273d1-6b34-4ba7-bb73-181fdc06b39c"],
      },
    });
    await expect(service.assess("incident-id", "user-id")).rejects.toThrow(
      "unknown evidence reference",
    );
    expect(repository.fail).toHaveBeenCalledWith(
      { assessmentId: "assessment-id", evidenceRevision: 2 },
      "assessment_failed",
    );
  });
});
