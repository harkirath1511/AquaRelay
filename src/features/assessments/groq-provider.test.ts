import { afterEach, describe, expect, it, vi } from "vitest";
import type { AssessmentEvidence, AssessmentResult } from "./contracts";
import { GroqAssessmentProvider } from "./groq-provider";

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
    media: Array.from({ length: 4 }, (_, n) => ({ id: `media-${n}`, mimeType: "image/jpeg", data: `base64-image-${n}` })),
  }],
};

afterEach(() => vi.unstubAllGlobals());

describe("GroqAssessmentProvider", () => {
  it("sends sanitized evidence, a strict schema, and at most three vision images", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(
      JSON.stringify({ choices: [{ message: { content: JSON.stringify(result) } }] }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    ));
    vi.stubGlobal("fetch", fetchMock);

    await expect(new GroqAssessmentProvider("test-key", "qwen/qwen3.8-27b").assess(evidence)).resolves.toEqual(result);

    expect(fetchMock.mock.calls[0][0]).toBe("https://api.groq.com/openai/v1/chat/completions");
    const options = fetchMock.mock.calls[0][1];
    expect(options.headers.Authorization).toBe("Bearer test-key");
    const request = JSON.parse(options.body as string);
    expect(request.model).toBe("qwen/qwen3.8-27b");
    expect(request.response_format.json_schema.strict).toBe(true);
    const content = request.messages[1].content;
    expect(content).toHaveLength(4);
    expect(content[0].text).not.toContain("51.501234");
    expect(content[0].text).not.toContain("-0.123456");
    expect(content[0].text).not.toContain("exactLocation");
    expect(content[0].text).not.toContain("authorId");
    expect(content[0].text).toContain("within_250m");
    expect(content[0].text).toContain("upstream");
    expect(content[0].text).toContain("outside_target_radius");
    expect(content[0].text).not.toContain("base64-image-0");
    expect(content[1].image_url.url).toBe("data:image/jpeg;base64,base64-image-0");
    expect(content[3].image_url.url).toBe("data:image/jpeg;base64,base64-image-2");
  });

  it("fails clearly on a provider HTTP error", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("{}", { status: 401 })));
    await expect(new GroqAssessmentProvider("invalid", "qwen/qwen3.8-27b").assess(evidence))
      .rejects.toThrow("Groq assessment failed with status 401");
  });

  it("uses Groq text assessment when vision is unavailable and records that images were not inspected", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response("{}", { status: 503 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(result) } }] }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const provider = new GroqAssessmentProvider("test-key", "qwen/qwen3.8-27b");

    const assessment = await provider.assess(evidence);

    expect(fetchMock).toHaveBeenCalledTimes(2);
    const fallback = JSON.parse(fetchMock.mock.calls[1][1].body as string);
    expect(fallback.model).toBe("openai/gpt-oss-20b");
    expect(fallback.messages[1].content).not.toContain("base64-image");
    expect(provider.modelName).toBe("openai/gpt-oss-20b");
    expect(assessment.missingEvidence).toContain("Photographs were not inspected by the AI provider; a human reviewer should inspect them.");
  });
});
