import { describe, expect, it, vi } from "vitest";

import type { ReviewRepository } from "./repository";
import { ReviewService } from "./service";

describe("ReviewService", () => {
  it("validates and records an explained outcome", async () => {
    const repository: ReviewRepository = {
      create: vi.fn().mockResolvedValue({
        review_id: "review",
        evidence_status: "resolved_or_explained",
        resolved_at: "2026-09-22T00:00:00Z",
      }),
    };
    const result = await new ReviewService(repository).create(
      "5f20cb5c-2f8a-4f4a-91ae-38407808db52",
      "reviewer",
      { decision: "explained", explanation: "Natural foam confirmed after inspection." },
    );
    expect(result.evidence_status).toBe("resolved_or_explained");
  });

  it("rejects an empty explanation", async () => {
    const repository: ReviewRepository = { create: vi.fn() };
    await expect(
      new ReviewService(repository).create(
        "5f20cb5c-2f8a-4f4a-91ae-38407808db52",
        "reviewer",
        { decision: "resolved", explanation: "" },
      ),
    ).rejects.toThrow();
  });
});
