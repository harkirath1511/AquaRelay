import { afterEach, describe, expect, it, vi } from "vitest";

import type { AssessmentEvidence, AssessmentResult } from "./contracts";
import { GeminiAssessmentProvider } from "./gemini-provider";

const observationId = "5f20cb5c-2f8a-4f4a-91ae-38407808db52";
const result: AssessmentResult = {
  observedFeatures: [{ text: "Foam is visible", evidenceReferences: [observationId] }],
  qualityIssues: [],
  missingEvidence: [],
  possibleExplanations: [],
  contradictions: [],
  suggestedMissionTypes: [],
  safetyFlags: [],
  summary: { text: "Foam is visible", evidenceReferences: [observationId] },
};

afterEach(() => vi.unstubAllGlobals());

describe("GeminiAssessmentProvider", () => {
  it("sends photographs as inline image parts without copying base64 into the text prompt", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({ candidates: [{ content: { parts: [{ text: JSON.stringify(result) }] } }] }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);
    const evidence: AssessmentEvidence = {
      incidentId: "incident",
      category: "foam",
      evidenceRevision: 2,
      observations: [{
        id: observationId,
        authorId: "user",
        missionType: null,
        observedAt: "2026-09-21T10:00:00Z",
        description: "White foam at 51.501234, -0.123456",
        answers: { exactLocation: { latitude: 51.501234, longitude: -0.123456 } },
        safetyFlags: [],
        isPotentialDuplicate: false,
        locationQuality: "approximate",
        locationConflicts: ["outside_target_radius", "51.501234"],
        spatialFacts: { distanceFromOrigin: "within_250m", streamRelationship: "same", flowRelationship: "upstream", insideTargetRadius: true },
        invalidatedAt: null,
        media: [{ id: "media", mimeType: "image/jpeg", data: "base64-image-data" }],
      }],
    };

    await new GeminiAssessmentProvider("key", "model").assess(evidence);

    const request = JSON.parse(fetchMock.mock.calls[0][1].body as string);
    const parts = request.contents[0].parts;
    expect(parts[0].text).not.toContain("51.501234");
    expect(parts[0].text).not.toContain("-0.123456");
    expect(parts[0].text).not.toContain("exactLocation");
    expect(parts[0].text).not.toContain("authorId");
    expect(parts[0].text).toContain("within_250m");
    expect(parts[0].text).toContain("upstream");
    expect(parts[0].text).toContain("outside_target_radius");
    expect(parts[0].text).not.toContain("base64-image-data");
    expect(parts[1]).toEqual({
      inlineData: { mimeType: "image/jpeg", data: "base64-image-data" },
    });
  });
});
