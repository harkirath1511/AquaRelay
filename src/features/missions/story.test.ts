import { describe, expect, it } from "vitest";

import { buildMissionStory } from "./story";

const mission = { id: "mission-1", incident_id: "case-1", available_from: "2026-09-24T12:00:00Z" };
const facts = {
  incidents: [{ id: "case-1", category: "erosion", evidence_status: "needs_verification", opened_at: "2026-09-24T09:00:00Z" }],
  missions: [{ id: "mission-1", created_at: "2026-09-24T12:00:00Z" }],
  reviews: [{ incident_id: "case-1", created_at: "2026-09-24T12:00:01Z" }],
  assessments: [{ incident_id: "case-1", completed_at: "2026-09-24T11:59:59Z" }],
  responses: [{ mission_id: "mission-1", submitted_at: "2026-09-24T13:00:00Z" }],
};

describe("mission history", () => {
  it("connects only the incident's nearby review and this mission's responses", () => {
    expect(buildMissionStory(mission, facts)).toMatchObject({
      category: "erosion", decision: "reviewer", decisionAt: "2026-09-24T12:00:01Z",
      responseCount: 1, lastResponseAt: "2026-09-24T13:00:00Z",
    });
  });

  it("does not attribute another case's reviewer action or response", () => {
    expect(buildMissionStory(mission, {
      ...facts,
      reviews: [{ incident_id: "case-2", created_at: "2026-09-24T12:00:00Z" }],
      assessments: [],
      responses: [{ mission_id: "mission-2", submitted_at: "2026-09-24T13:00:00Z" }],
    })).toMatchObject({ decision: "planned", decisionAt: null, responseCount: 0 });
  });

  it("uses a matching assessment when no reviewer action created the mission", () => {
    expect(buildMissionStory(mission, { ...facts, reviews: [] })).toMatchObject({
      decision: "assessment", decisionAt: "2026-09-24T11:59:59Z",
    });
  });
});
