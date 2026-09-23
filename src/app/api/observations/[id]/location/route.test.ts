import { beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  reviewer: vi.fn(),
  server: vi.fn(),
  rpc: vi.fn(),
  quota: vi.fn(),
}));
vi.mock("@/lib/auth/require-user", async (original) => ({
  ...(await original<typeof import("@/lib/auth/require-user")>()),
  requireReviewer: mocks.reviewer,
}));
vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: mocks.server,
}));
vi.mock("@/features/locations/read-quota", () => ({
  consumeLocationReadQuota: mocks.quota,
}));
import { AuthorizationError } from "@/lib/auth/require-user";
import { GET } from "./route";
const id = "11111111-1111-4111-8111-111111111111";
const context = { params: Promise.resolve({ id }) };

beforeEach(() => {
  vi.clearAllMocks();
  mocks.reviewer.mockResolvedValue({ id: "reviewer" });
  mocks.server.mockResolvedValue({ rpc: mocks.rpc });
  mocks.quota.mockResolvedValue(undefined);
  mocks.rpc.mockResolvedValue({
    data: [{ latitude: 12.975, longitude: 77.595 }],
    error: null,
  });
});
it("does not access precise coordinates without reviewer authorisation", async () => {
  mocks.reviewer.mockRejectedValue(new AuthorizationError());
  const result = await GET(
    new Request("http://localhost/api/observations/id/location"),
    context,
  );
  expect(result.status).toBe(403);
  expect(mocks.server).not.toHaveBeenCalled();
  expect(mocks.rpc).not.toHaveBeenCalled();
});
it("uses the session-scoped audited RPC and prevents response caching", async () => {
  const result = await GET(
    new Request("http://localhost/api/observations/id/location"),
    context,
  );
  expect(result.status).toBe(200);
  expect(result.headers.get("Cache-Control")).toBe("private, no-store");
  expect(mocks.quota).toHaveBeenCalledWith(
    expect.anything(),
    "reviewer",
    "incident_detail",
  );
  expect(mocks.rpc).toHaveBeenCalledWith("get_observation_location", {
    p_observation_id: id,
  });
});
it("returns an empty collection when retention rules withhold a location", async () => {
  mocks.rpc.mockResolvedValue({ data: [], error: null });
  const result = await GET(
    new Request("http://localhost/api/observations/id/location"),
    context,
  );
  expect(await result.json()).toEqual({ locations: [] });
});
