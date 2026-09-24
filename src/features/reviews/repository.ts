import type { SupabaseClient } from "@supabase/supabase-js";

import type { CreateReviewInput } from "./contracts";

interface ReviewRecord {
  review_id: string;
  evidence_status: string;
  resolved_at: string | null;
}

export interface ReviewRepository {
  create(
    incidentId: string,
    reviewerId: string,
    input: CreateReviewInput,
  ): Promise<ReviewRecord>;
}

export class SupabaseReviewRepository implements ReviewRepository {
  constructor(private readonly supabase: SupabaseClient) {}

  async create(
    incidentId: string,
    reviewerId: string,
    input: CreateReviewInput,
  ) {
    const { data, error } = await this.supabase.rpc(
      input.requestedMissionTypes.length
        ? "record_incident_review_with_missions"
        : "record_incident_review",
      {
        p_incident_id: incidentId,
        p_reviewer_id: reviewerId,
        p_decision: input.decision,
        p_explanation: input.explanation,
        ...(input.requestedMissionTypes.length
          ? { p_mission_types: input.requestedMissionTypes }
          : {}),
      },
    );
    if (error) throw new Error(`Review creation failed: ${error.message}`);
    const record = (data as ReviewRecord[] | null)?.[0];
    if (!record) throw new Error("Review creation returned no result");
    return record;
  }

  async queue(limit: number, offset: number, incidentId?: string) {
    let query = this.supabase
      .from("incidents")
      .select(
        "id, stream_id, category, location, location_label, evidence_status, status_reasons, safety_state, evidence_revision, opened_at, updated_at, observations(id, location_quality, location_conflicts, spatial_facts)",
      )
      .eq("is_demo", false);
    query = query.is("merged_into_incident_id", null);
    query = incidentId
      ? query.eq("id", incidentId)
      : query.is("resolved_at", null);
    const { data, error } = await query
      .order("updated_at", { ascending: false })
      .range(offset, offset + limit - 1);
    if (error) throw new Error(`Review queue failed: ${error.message}`);
    return data;
  }
}
