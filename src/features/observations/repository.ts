import type { SupabaseClient } from "@supabase/supabase-js";

import type {
  IncidentListQuery,
  SubmissionResult,
  SubmitObservationInput,
} from "./contracts";

interface SubmissionRecord {
  incident_id: string;
  observation_id: string;
  created_incident: boolean;
  replayed: boolean;
}

export interface ObservationRepository {
  submit(
    userId: string,
    idempotencyKey: string,
    input: SubmitObservationInput,
  ): Promise<SubmissionResult>;
}

export class SupabaseObservationRepository implements ObservationRepository {
  constructor(private readonly supabase: SupabaseClient) {}

  async submit(
    userId: string,
    idempotencyKey: string,
    input: SubmitObservationInput,
  ): Promise<SubmissionResult> {
    const { data, error } = await this.supabase.rpc("submit_observation", {
      p_user_id: userId,
      p_idempotency_key: idempotencyKey,
      p_stream_id: input.streamId ?? null,
      p_category: input.category,
      p_latitude: input.location.latitude,
      p_longitude: input.location.longitude,
      p_location_label: input.locationLabel ?? null,
      p_observed_at: input.observedAt,
      p_description: input.description,
      p_answers: input.answers,
      p_safety_flags: input.safetyFlags,
    });

    if (error) {
      throw new Error(`Observation submission failed: ${error.message}`);
    }

    const record = (data as SubmissionRecord[] | null)?.[0];
    if (!record) {
      throw new Error("Observation submission returned no result");
    }

    return {
      incidentId: record.incident_id,
      observationId: record.observation_id,
      createdIncident: record.created_incident,
      replayed: record.replayed,
    };
  }
}

export class SupabaseIncidentReader {
  constructor(private readonly supabase: SupabaseClient) {}

  async list(query: IncidentListQuery) {
    let request = this.supabase
      .from("incidents")
      .select(
        "id, stream_id, category, location, location_label, evidence_status, status_reasons, safety_state, evidence_revision, is_demo, opened_at, updated_at",
      )
      .order("updated_at", { ascending: false })
      .range(query.offset, query.offset + query.limit - 1);

    if (query.category) request = request.eq("category", query.category);
    if (query.status) request = request.eq("evidence_status", query.status);

    const { data, error } = await request;
    if (error) throw new Error(`Incident listing failed: ${error.message}`);
    return data;
  }

  async findById(id: string) {
    const { data, error } = await this.supabase
      .from("incidents")
      .select(
        `
          id, stream_id, category, location, location_label, evidence_status,
          status_reasons, safety_state, evidence_revision, is_demo, opened_at,
          resolved_at, updated_at,
          observations (
            id, mission_id, author_id, observed_at, submitted_at, location,
            description, answers, safety_flags, is_potential_duplicate, invalidated_at
          ),
          missions (
            id, type, state, evidence_gap, instructions, safety_message,
            target_location, available_from, due_at
          ),
          assessments (
            id, evidence_revision, state, result, failure_code, model_provider,
            model_name, started_at, completed_at
          ),
          incident_events (id, actor_id, type, payload, created_at)
        `,
      )
      .eq("id", id)
      .order("submitted_at", { referencedTable: "observations", ascending: true })
      .order("created_at", { referencedTable: "incident_events", ascending: true })
      .maybeSingle();

    if (error) throw new Error(`Incident lookup failed: ${error.message}`);
    return data;
  }
}
