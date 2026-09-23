import { beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  reviewer: vi.fn(),
  server: vi.fn(),
  rpc: vi.fn(),
}));
vi.mock("@/lib/auth/require-user", async (original) => ({
  ...(await original<typeof import("@/lib/auth/require-user")>()),
  requireReviewer: mocks.reviewer,
}));
vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: mocks.server,
}));
import { AuthorizationError } from "@/lib/auth/require-user";
import { POST } from "./route";
const id = "11111111-1111-4111-8111-111111111111";
const request = (body: unknown) =>
  new Request(`http://localhost/api/incidents/${id}/reviews`, {
    method: "POST",
    body: JSON.stringify(body),
  });
const context = { params: Promise.resolve({ id }) };
beforeEach(() => {
  vi.clearAllMocks();
  mocks.reviewer.mockResolvedValue({ id: "reviewer" });
  mocks.server.mockResolvedValue({ rpc: mocks.rpc });
  mocks.rpc.mockResolvedValue({
    data: [
      {
        review_id: "review",
        evidence_status: "needs_verification",
        resolved_at: null,
      },
    ],
    error: null,
  });
});
it("denies mission requests from a participant before accessing the database", async () => {
  mocks.reviewer.mockRejectedValue(new AuthorizationError());
  const result = await POST(
    request({
      decision: "request_more_evidence",
      explanation: "Need an upstream view",
      requestedMissionTypes: ["upstream_comparison"],
    }),
    context,
  );
  expect(result.status).toBe(403);
  expect(mocks.rpc).not.toHaveBeenCalled();
});
it("uses one session-scoped transaction for a review and its follow-up missions", async () => {
  const result = await POST(
    request({
      decision: "request_more_evidence",
      explanation: "Need an upstream view",
      requestedMissionTypes: ["upstream_comparison"],
    }),
    context,
  );
  expect(result.status).toBe(201);
  expect(mocks.rpc).toHaveBeenCalledExactlyOnceWith(
    "record_incident_review_with_missions",
    {
      p_incident_id: id,
      p_reviewer_id: "reviewer",
      p_decision: "request_more_evidence",
      p_explanation: "Need an upstream view",
      p_mission_types: ["upstream_comparison"],
    },
  );
});
it.each([
  { decision: "resolved", requestedMissionTypes: ["upstream_comparison"] },
  {
    decision: "request_more_evidence",
    requestedMissionTypes: ["water_sampling"],
  },
  {
    decision: "request_more_evidence",
    requestedMissionTypes: ["upstream_comparison", "upstream_comparison"],
  },
])(
  "rejects invalid mission/outcome combinations before mutation",
  async (input) => {
    const result = await POST(
      request({ ...input, explanation: "Review reasoning" }),
      context,
    );
    expect(result.status).toBe(400);
    expect(mocks.rpc).not.toHaveBeenCalled();
  },
);
