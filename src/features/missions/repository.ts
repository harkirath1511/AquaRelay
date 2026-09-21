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
  replayed: boolean;
}

export interface MissionRepository {
  list(query: MissionListQuery): Promise<unknown[]>;
  respond(
    missionId: string,
    userId: string,
    idempotencyKey: string,
    input: SubmitMissionResponseInput,
  ): Promise<MissionResponseResult>;
}

export class SupabaseMissionRepository implements MissionRepository {
  constructor(private readonly supabase: SupabaseClient) {}

  async list(query: MissionListQuery) {
    const { data, error } = await this.supabase.rpc("list_available_missions", {
      p_latitude: query.latitude ?? null,
      p_longitude: query.longitude ?? null,
      p_radius_meters: query.radiusMeters,
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
      replayed: record.replayed,
    };
  }
}
