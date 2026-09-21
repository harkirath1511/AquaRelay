import { describe, expect, it, vi } from "vitest";

import type { ObservationRepository } from "./repository";
import { ObservationService } from "./service";

const validInput = {
  category: "foam",
  location: { latitude: 51.5, longitude: -0.1 },
  observedAt: "2026-09-21T10:00:00+00:00",
  description: "Persistent white foam near the footbridge",
};

describe("ObservationService", () => {
  it("validates and delegates a submission", async () => {
    const submit = vi.fn().mockResolvedValue({
      incidentId: "incident-id",
      observationId: "observation-id",
      createdIncident: true,
      replayed: false,
    });
    const repository: ObservationRepository = { submit };

    const result = await new ObservationService(repository).submit(
      "user-id",
      "request-123",
      validInput,
    );

    expect(result.createdIncident).toBe(true);
    expect(submit).toHaveBeenCalledWith(
      "user-id",
      "request-123",
      expect.objectContaining({ answers: {}, safetyFlags: [] }),
    );
  });

  it("rejects invalid coordinates before persistence", async () => {
    const repository: ObservationRepository = { submit: vi.fn() };
    const service = new ObservationService(repository);

    await expect(
      service.submit("user-id", "request-123", {
        ...validInput,
        location: { latitude: 151, longitude: -0.1 },
      }),
    ).rejects.toThrow();
    expect(repository.submit).not.toHaveBeenCalled();
  });

  it("requires an idempotency key with enough entropy", async () => {
    const repository: ObservationRepository = { submit: vi.fn() };

    await expect(
      new ObservationService(repository).submit("user-id", "short", validInput),
    ).rejects.toThrow();
  });
});
