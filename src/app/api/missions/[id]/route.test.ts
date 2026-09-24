import { beforeEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireUser: vi.fn(),
  createClient: vi.fn(),
  from: vi.fn(),
  mission: { select: vi.fn(), eq: vi.fn(), maybeSingle: vi.fn() },
  incident: { select: vi.fn(), eq: vi.fn(), maybeSingle: vi.fn() },
}));
vi.mock("@/lib/auth/require-user", async (importOriginal) => ({
  ...await importOriginal<typeof import("@/lib/auth/require-user")>(),
  requireUser: mocks.requireUser,
}));
vi.mock("@/lib/supabase/admin", () => ({ createSupabaseAdminClient: mocks.createClient }));

import { AuthenticationError } from "@/lib/auth/require-user";
import { GET } from "./route";

const id = "a2e88d1d-8405-4925-a3a1-0902d096c2dd";
const request = () => GET(new Request(`http://localhost/api/missions/${id}`), { params: Promise.resolve({ id }) });

beforeEach(() => {
  vi.resetAllMocks();
  mocks.requireUser.mockResolvedValue({ id: "participant" });
  mocks.createClient.mockReturnValue({ from: mocks.from });
  mocks.from.mockImplementation((table: string) => table === "missions" ? mocks.mission : mocks.incident);
  for (const query of [mocks.mission, mocks.incident]) {
    query.select.mockReturnValue(query);
    query.eq.mockReturnValue(query);
  }
  mocks.mission.maybeSingle.mockResolvedValue({ data: {
    id, incident_id: "case", type: "clearer_photo", state: "open",
    evidence_gap: "The bank needs a clearer view.", instructions: "Photograph from a safe path.",
    safety_message: "Stay away from the bank.", available_from: "2026-09-01T00:00:00Z", due_at: null,
  }, error: null });
  mocks.incident.maybeSingle.mockResolvedValue({ data: {
    category: "erosion", is_demo: false, safety_state: "normal",
    resolved_at: null, merged_into_incident_id: null,
  }, error: null });
});

it("returns only safe mission instructions and the fixed incident category", async () => {
  const response = await request();
  expect(response.status).toBe(200);
  expect(response.headers.get("Cache-Control")).toBe("private, no-store");
  expect((await response.json()).mission).toMatchObject({ type: "clearer_photo", category: "erosion" });
  expect(mocks.mission.select.mock.calls[0][0]).not.toMatch(/location|latitude|longitude/);
  expect(mocks.incident.select.mock.calls[0][0]).not.toMatch(/location|latitude|longitude/);
});

it("does not offer a paused investigation for response", async () => {
  mocks.incident.maybeSingle.mockResolvedValue({ data: {
    category: "erosion", is_demo: false, safety_state: "missions_paused",
    resolved_at: null, merged_into_incident_id: null,
  }, error: null });
  expect((await request()).status).toBe(404);
});

it("requires authentication before mission lookup", async () => {
  mocks.requireUser.mockRejectedValue(new AuthenticationError());
  expect((await request()).status).toBe(401);
  expect(mocks.from).not.toHaveBeenCalled();
});
