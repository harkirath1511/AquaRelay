import type { SupabaseClient } from "@supabase/supabase-js";

export interface MissionStory {
  category: string;
  evidenceStatus: string;
  reportedAt: string;
  missionCreatedAt: string;
  decision: "reviewer" | "assessment" | "planned";
  decisionAt: string | null;
  responseCount: number;
  lastResponseAt: string | null;
}

interface MissionRef {
  id: string;
  incident_id: string;
  available_from: string;
}

interface StoryFacts {
  incidents: Array<{ id: string; category: string; evidence_status: string; opened_at: string }>;
  missions: Array<{ id: string; created_at: string }>;
  reviews: Array<{ incident_id: string; created_at: string }>;
  assessments: Array<{ incident_id: string; completed_at: string | null }>;
  responses: Array<{ mission_id: string | null; submitted_at: string }>;
}

const nearCreation = (eventAt: string | null, createdAt: string) =>
  eventAt !== null && Math.abs(Date.parse(eventAt) - Date.parse(createdAt)) <= 120_000;

export function buildMissionStory(mission: MissionRef, facts: StoryFacts): MissionStory | null {
  const incident = facts.incidents.find((item) => item.id === mission.incident_id);
  if (!incident) return null;
  const createdAt = facts.missions.find((item) => item.id === mission.id)?.created_at ?? mission.available_from;
  const review = facts.reviews
    .filter((item) => item.incident_id === mission.incident_id && nearCreation(item.created_at, createdAt))
    .sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at))[0];
  const assessment = !review ? facts.assessments
    .filter((item) => item.incident_id === mission.incident_id && nearCreation(item.completed_at, createdAt))
    .sort((a, b) => Date.parse(b.completed_at ?? "") - Date.parse(a.completed_at ?? ""))[0] : null;
  const responses = facts.responses
    .filter((item) => item.mission_id === mission.id)
    .sort((a, b) => Date.parse(b.submitted_at) - Date.parse(a.submitted_at));
  return {
    category: incident.category,
    evidenceStatus: incident.evidence_status,
    reportedAt: incident.opened_at,
    missionCreatedAt: createdAt,
    decision: review ? "reviewer" : assessment ? "assessment" : "planned",
    decisionAt: review?.created_at ?? assessment?.completed_at ?? null,
    responseCount: responses.length,
    lastResponseAt: responses[0]?.submitted_at ?? null,
  };
}

export async function attachMissionStories<T extends MissionRef>(
  client: SupabaseClient,
  missions: T[],
): Promise<Array<T & { story: MissionStory | null }>> {
  if (!missions.length) return [];
  const incidentIds = [...new Set(missions.map((mission) => mission.incident_id))];
  const missionIds = missions.map((mission) => mission.id);
  const [incidents, missionDates, reviews, assessments, responses] = await Promise.all([
    client.from("incidents").select("id,category,evidence_status,opened_at").in("id", incidentIds),
    client.from("missions").select("id,created_at").in("id", missionIds),
    client.from("reviews").select("incident_id,created_at").in("incident_id", incidentIds).eq("decision", "request_more_evidence"),
    client.from("assessments").select("incident_id,completed_at").in("incident_id", incidentIds).eq("state", "complete"),
    client.from("observations").select("mission_id,submitted_at").in("mission_id", missionIds).is("invalidated_at", null),
  ]);
  const failed = [incidents, missionDates, reviews, assessments, responses].find((result) => result.error);
  if (failed?.error) throw new Error(`Mission history failed: ${failed.error.message}`);
  const facts: StoryFacts = {
    incidents: incidents.data ?? [],
    missions: missionDates.data ?? [],
    reviews: reviews.data ?? [],
    assessments: assessments.data ?? [],
    responses: responses.data ?? [],
  };
  return missions.map((mission) => ({ ...mission, story: buildMissionStory(mission, facts) }));
}
