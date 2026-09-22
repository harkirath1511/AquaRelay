import type { SupabaseClient } from "@supabase/supabase-js";

import type {
  MissionListQuery,
  MissionResponseResult,
  SubmitMissionResponseInput,
} from "./contracts";

interface MissionResponseRecord {
  incident_id: string;
  observation_id: string;
  evidence_revision: number;
  impact_points: number;
  location_quality_flag: "far_from_target" | "target_unknown" | null;
  location_quality: MissionResponseResult["locationQuality"];
  spatial_facts: Record<string, unknown>;
  replayed: boolean;
}

export interface MissionRepository {
  list(userId: string, query: MissionListQuery): Promise<unknown[]>;
  respond(
    missionId: string,
    userId: string,
    idempotencyKey: string,
    input: SubmitMissionResponseInput,
  ): Promise<MissionResponseResult>;
}

export class SupabaseMissionRepository implements MissionRepository {
  constructor(private readonly supabase: SupabaseClient) {}

  async list(userId: string, query: MissionListQuery) {
    // Snap the request to the same stable public cell so a caller cannot
    // triangulate an exact target with arbitrarily small radius probes.
    const cellCenter = (value: number, offset: number, limit: number) =>
      Math.min(limit, Math.floor((value + offset) * 100) / 100 - offset + 0.005);
    const { data, error } = await this.supabase.rpc("list_available_missions", {
      p_requester_id: userId,
      p_latitude: cellCenter(query.latitude, 90, 89.995),
      p_longitude: cellCenter(query.longitude, 180, 179.995),
      p_radius_meters: Math.ceil((query.radiusMeters + 800) / 1_000) * 1_000,
      p_type: query.type ?? null,
      p_limit: query.limit,
    });
    if (error) throw new Error(`Mission listing failed: ${error.message}`);
    return data ?? [];
  }

  async respond(
    missionId: string,
    userId: string,
    idempotencyKey: string,
    input: SubmitMissionResponseInput,
  ) {
    const { data, error } = await this.supabase.rpc("submit_mission_response", {
      p_mission_id: missionId,
      p_user_id: userId,
      p_idempotency_key: idempotencyKey,
      p_latitude: input.location.latitude,
      p_longitude: input.location.longitude,
      p_accuracy_meters: input.location.accuracyMeters,
      p_location_source: input.location.source,
      p_captured_at: input.location.capturedAt,
      p_observed_at: input.observedAt,
      p_description: input.description,
      p_answers: input.answers,
      p_safety_flags: input.safetyFlags,
    });
    if (error) throw new Error(`Mission response failed: ${error.message}`);
    const record = (data as MissionResponseRecord[] | null)?.[0];
    if (!record) throw new Error("Mission response returned no result");
    return {
      incidentId: record.incident_id,
      observationId: record.observation_id,
      evidenceRevision: record.evidence_revision,
      impactPoints: record.impact_points,
      locationQualityFlag: record.location_quality_flag,
      locationQuality: record.location_quality,
      spatialFacts: record.spatial_facts,
      replayed: record.replayed,
    };
  }
}
