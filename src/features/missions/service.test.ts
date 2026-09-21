import { describe, expect, it, vi } from "vitest";

import type { MissionRepository } from "./repository";
import { MissionService } from "./service";

const repository: MissionRepository = {
  list: vi.fn().mockResolvedValue([]),
  respond: vi.fn().mockResolvedValue({
    incidentId: "incident",
    observationId: "observation",
    evidenceRevision: 2,
    impactPoints: 10,
    replayed: false,
  }),
};

describe("MissionService", () => {
  it("requires both coordinates when filtering nearby missions", async () => {
    await expect(new MissionService(repository).list({ latitude: "51.5" })).rejects.toThrow();
  });

  it("validates a mission response before persistence", async () => {
    const service = new MissionService(repository);
    const response = await service.respond(
      "5f20cb5c-2f8a-4f4a-91ae-38407808db52",
      "user",
      "request-123",
      {
        location: { latitude: 51.5, longitude: -0.1 },
        observedAt: "2026-09-21T11:00:00+00:00",
        description: "No foam at this comparison point",
      },
    );
    expect(response.impactPoints).toBe(10);
  });
});
