import { beforeEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireUser: vi.fn(),
  createClient: vi.fn(),
  from: vi.fn(),
  incidentQuery: {
    select: vi.fn(), eq: vi.fn(), neq: vi.fn(), is: vi.fn(),
  },
  missionQuery: {
    select: vi.fn(), in: vi.fn(), eq: vi.fn(), lte: vi.fn(), or: vi.fn(), order: vi.fn(),
  },
}));
vi.mock("@/lib/auth/require-user", async (importOriginal) => ({
  ...await importOriginal<typeof import("@/lib/auth/require-user")>(),
  requireUser: mocks.requireUser,
}));
vi.mock("@/lib/supabase/admin", () => ({ createSupabaseAdminClient: mocks.createClient }));
vi.mock("@/features/missions/story", () => ({ attachMissionStories: vi.fn(async (_client, missions) => missions) }));

import { AuthenticationError } from "@/lib/auth/require-user";
import { GET } from "./route";

beforeEach(() => {
  vi.resetAllMocks();
  mocks.requireUser.mockResolvedValue({ id: "reporter" });
  mocks.createClient.mockReturnValue({ from: mocks.from });
  mocks.from.mockImplementation((table: string) => table === "incidents" ? mocks.incidentQuery : mocks.missionQuery);
  for (const method of ["select", "eq", "neq"] as const) {
    mocks.incidentQuery[method].mockReturnValue(mocks.incidentQuery);
  }
  mocks.incidentQuery.is.mockReturnValueOnce(mocks.incidentQuery)
    .mockResolvedValue({ data: [{ id: "own-case" }], error: null });
  for (const method of ["select", "in", "eq", "lte", "or"] as const) {
    mocks.missionQuery[method].mockReturnValue(mocks.missionQuery);
  }
  mocks.missionQuery.order.mockResolvedValue({ data: [{
    id: "mission", incident_id: "own-case", type: "clearer_photo", state: "open",
    evidence_gap: "Clear visual evidence is missing.", instructions: "Observe safely.",
    safety_message: "Stay on public paths.",
  }], error: null });
});

it("requires the signed-in user before reading missions", async () => {
  mocks.requireUser.mockRejectedValue(new AuthenticationError());
  expect((await GET()).status).toBe(401);
  expect(mocks.from).not.toHaveBeenCalled();
});

it("lists open missions only for investigations created by the user without location data", async () => {
  const response = await GET();
  expect(response.status).toBe(200);
  expect(response.headers.get("Cache-Control")).toBe("private, no-store");
  expect(mocks.incidentQuery.eq).toHaveBeenCalledWith("created_by", "reporter");
  expect(mocks.missionQuery.in).toHaveBeenCalledWith("incident_id", ["own-case"]);
  expect(mocks.missionQuery.eq).toHaveBeenCalledWith("state", "open");
  expect((await response.json()).missions).toHaveLength(1);
  expect(mocks.missionQuery.select.mock.calls[0][0]).not.toContain("location");
});

it("does not query all missions when the user has no investigations", async () => {
  mocks.incidentQuery.is.mockReset().mockReturnValueOnce(mocks.incidentQuery)
    .mockResolvedValue({ data: [], error: null });
  expect((await (await GET()).json()).missions).toEqual([]);
  expect(mocks.from).toHaveBeenCalledTimes(1);
});
