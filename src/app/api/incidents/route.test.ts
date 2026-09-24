import { beforeEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireUser: vi.fn(), list: vi.fn(), findById: vi.fn(), quota: vi.fn(),
}));
vi.mock("@/lib/auth/require-user", async (original) => ({
  ...(await original<typeof import("@/lib/auth/require-user")>()),
  requireUser: mocks.requireUser,
}));
vi.mock("@/lib/supabase/admin", () => ({ createSupabaseAdminClient: () => ({}) }));
vi.mock("@/features/observations/repository", () => ({
  SupabaseIncidentReader: class {
    list = mocks.list;
    findById = mocks.findById;
  },
}));
vi.mock("@/features/locations/read-quota", async (original) => ({
  ...(await original<typeof import("@/features/locations/read-quota")>()),
  consumeLocationReadQuota: mocks.quota,
}));

import { GET as listIncidents } from "./route";
import { GET as getIncident } from "./[id]/route";

const id = "11111111-1111-4111-8111-111111111111";
beforeEach(() => {
  vi.clearAllMocks();
  mocks.requireUser.mockResolvedValue({ id: "participant" });
  mocks.quota.mockRejectedValue(new Error("Location read limit reached"));
  mocks.list.mockResolvedValue([{ id, location_label: "Approximate area" }]);
  mocks.findById.mockResolvedValue({ id, location_label: "Approximate area", observations: [] });
});

it("keeps the generalized investigation list available when exact-location reads are exhausted", async () => {
  const response = await listIncidents(new Request("http://localhost/api/incidents?limit=20"));
  expect(response.status).toBe(200);
  expect((await response.json()).incidents[0].id).toBe(id);
  expect(mocks.quota).not.toHaveBeenCalled();
});

it("keeps report evidence available when exact-location reads are exhausted", async () => {
  const response = await getIncident(new Request(`http://localhost/api/incidents/${id}`),
    { params: Promise.resolve({ id }) });
  expect(response.status).toBe(200);
  expect((await response.json()).incident.id).toBe(id);
  expect(mocks.quota).not.toHaveBeenCalled();
});
