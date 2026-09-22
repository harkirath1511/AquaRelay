import { beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ requireUser: vi.fn(), rpc: vi.fn(), admin: vi.fn() }));
vi.mock("@/lib/auth/require-user", async (importOriginal) => ({
  ...await importOriginal<typeof import("@/lib/auth/require-user")>(),
  requireUser: mocks.requireUser,
}));
vi.mock("@/lib/supabase/admin", () => ({ createSupabaseAdminClient: mocks.admin }));
import { GET, POST } from "./route";
import { AuthenticationError } from "@/lib/auth/require-user";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.requireUser.mockResolvedValue({ id: "reporter" });
  mocks.admin.mockReturnValue({ rpc: mocks.rpc });
  mocks.rpc.mockResolvedValue({ data: [], error: null });
});

it("requires authentication before invoking the privileged spatial query", async () => {
  mocks.requireUser.mockRejectedValue(new AuthenticationError());
  expect((await POST(new Request("http://localhost/api/missions", { method: "POST", body: "{}" }))).status).toBe(401);
  expect(mocks.admin).not.toHaveBeenCalled();
});
it("rejects coordinate URLs without echoing the query or invoking spatial search", async () => {
  const result = await GET(new Request("http://localhost/api/missions?latitude=51.501234&longitude=-0.123456"));
  expect(result.status).toBe(400);
  expect(await result.text()).not.toContain("51.501234");
  expect(mocks.rpc).not.toHaveBeenCalled();
});
it("uses body coordinates internally and disables caching of the response", async () => {
  const result = await POST(new Request("http://localhost/api/missions", {
    method: "POST", body: JSON.stringify({ latitude: 51.501234, longitude: -0.123456 }),
  }));
  expect(result.status).toBe(200);
  expect(result.headers.get("Cache-Control")).toBe("private, no-store");
  expect(mocks.rpc).toHaveBeenCalledWith("list_available_missions", expect.objectContaining({ p_latitude: 51.501234, p_longitude: -0.123456 }));
  expect(await result.text()).not.toContain("51.501234");
});
