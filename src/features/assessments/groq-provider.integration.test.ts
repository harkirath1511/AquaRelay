import sharp from "sharp";
import { expect, it } from "vitest";
import { GroqAssessmentProvider } from "./groq-provider";
import type { AssessmentEvidence } from "./contracts";

const liveTest = process.env.RUN_GROQ_INTEGRATION === "1" ? it : it.skip;

liveTest("assesses synthetic text and image evidence with the live Groq API", async () => {
  const key = process.env.GROQ_API_KEY;
  if (!key) throw new Error("Set GROQ_API_KEY for the opt-in Groq integration test");
  const observationId = "5f20cb5c-2f8a-4f4a-91ae-38407808db52";
  const image = await sharp({
    create: { width: 128, height: 128, channels: 3, background: "#557d90" },
  }).jpeg().toBuffer();
  const evidence: AssessmentEvidence = {
    incidentId: "synthetic-test",
    category: "foam",
    evidenceRevision: 1,
    observations: [{
      id: observationId,
      authorId: "synthetic-test",
      missionType: null,
      observedAt: "2026-09-24T00:00:00Z",
      description: "Synthetic test observation: a flat blue sample image. No real stream or person is represented.",
      answers: {},
      safetyFlags: [],
      isPotentialDuplicate: false,
      locationQuality: "approximate",
      locationConflicts: [],
      invalidatedAt: null,
      media: [{ id: "synthetic-image", mimeType: "image/jpeg", data: image.toString("base64") }],
    }],
  };

  const provider = new GroqAssessmentProvider(key, process.env.GROQ_MODEL || "qwen/qwen3.8-27b");
  const result = await provider.assess(evidence);
  expect(result.summary.text.length).toBeGreaterThan(0);
  expect(Array.isArray(result.safetyFlags)).toBe(true);
  expect(["qwen/qwen3.8-27b", "openai/gpt-oss-20b"]).toContain(provider.modelName);
}, 90_000);
