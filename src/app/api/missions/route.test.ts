import { beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ requireUser: vi.fn(), rpc: vi.fn(), quotaRpc: vi.fn(), admin: vi.fn(), server: vi.fn() }));
vi.mock("@/lib/auth/require-user", async (importOriginal) => ({
  ...await importOriginal<typeof import("@/lib/auth/require-user")>(),
  requireUser: mocks.requireUser,
}));
vi.mock("@/lib/supabase/admin", () => ({ createSupabaseAdminClient: mocks.admin }));
vi.mock("@/lib/supabase/server", () => ({ createSupabaseServerClient: mocks.server }));
import { GET, POST } from "./route";
import { AuthenticationError } from "@/lib/auth/require-user";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.requireUser.mockResolvedValue({ id: "reporter" });
  mocks.admin.mockReturnValue({ rpc: mocks.rpc });
  mocks.server.mockResolvedValue({ rpc: mocks.quotaRpc });
  mocks.rpc.mockResolvedValue({ data: [], error: null });
  mocks.quotaRpc.mockResolvedValue({ error: null });
});

it("requires authentication before invoking the privileged spatial query", async () => {
  mocks.requireUser.mockRejectedValue(new AuthenticationError());
  expect((await POST(new Request("http://localhost/api/missions", { method: "POST", body: "{}" }))).status).toBe(401);
  expect(mocks.admin).not.toHaveBeenCalled();
});
it("rejects coordinate URLs without echoing the query or invoking spatial search", async () => {
  const result = await GET(new Request("http://localhost/api/missions?latitude=51.501234&longitude=-0.123456"));
  expect(result.status).toBe(405);
  expect(await result.text()).not.toContain("51.501234");
  expect(mocks.rpc).not.toHaveBeenCalled();
});
it("uses body coordinates internally and disables caching of the response", async () => {
  const result = await POST(new Request("http://localhost/api/missions", {
    method: "POST", body: JSON.stringify({ latitude: 51.501234, longitude: -0.123456 }),
  }));
  expect(result.status).toBe(200);
  expect(result.headers.get("Cache-Control")).toBe("private, no-store");
  expect(mocks.rpc).toHaveBeenCalledWith("list_available_missions", expect.any(Object));
  expect(mocks.rpc.mock.calls[0][1].p_latitude).toBeCloseTo(51.505);
  expect(mocks.rpc.mock.calls[0][1].p_longitude).toBeCloseTo(-0.125);
  expect(mocks.rpc.mock.calls[0][1].p_radius_meters).toBe(6_000);
  expect(mocks.rpc.mock.calls[0][1].p_requester_id).toBe("reporter");
  expect(await result.text()).not.toContain("51.501234");
});
it("stops a search when the user's database quota is exhausted", async () => {
  mocks.quotaRpc.mockResolvedValue({ error: { message: "Location read limit reached" } });
  const result = await POST(new Request("http://localhost/api/missions", {
    method: "POST", body: JSON.stringify({ latitude: 51.501234, longitude: -0.123456 }),
  }));
  expect(result.status).toBe(429);
  expect(mocks.admin).not.toHaveBeenCalled();
});
