import type { SupabaseClient } from "@supabase/supabase-js";

export class IncidentExportRepository {
  constructor(private readonly admin: SupabaseClient) {}

  async build(incidentId: string) {
    const { data, error } = await this.admin
      .from("incidents")
      .select(
        `
          id, stream_id, category, location, location_label, evidence_status,
          status_reasons, safety_state, evidence_revision, opened_at, resolved_at, updated_at,
          streams (id, name, city),
          observations (
            id, mission_id, author_id, observed_at, submitted_at, location,
            description, answers, safety_flags, is_potential_duplicate, location_quality_flag,
            location_quality, location_conflicts, spatial_facts, invalidated_at,
            media (id, object_path, mime_type, byte_size, processing_state)
          ),
          missions (id, type, state, evidence_gap, available_from, due_at),
          assessments (id, evidence_revision, state, result, model_provider, model_name, completed_at),
          reviews (id, reviewer_id, decision, explanation, created_at),
          incident_events (id, actor_id, type, payload, created_at)
        `,
      )
      .eq("id", incidentId)
      .maybeSingle();
    if (error) throw new Error(`Incident export failed: ${error.message}`);
    if (!data) return null;

    const incident = data as unknown as {
      observations: Array<{
        media: Array<{ id: string; object_path: string; processing_state: string }>;
      }>;
      [key: string]: unknown;
    };
    const mediaUrls = new Map<string, string>();
    for (const observation of incident.observations) {
      for (const media of observation.media.filter(({ processing_state }) => processing_state === "ready")) {
        const { data: signed, error: signedError } = await this.admin.storage
          .from("observation-media")
          .createSignedUrl(media.object_path, 900);
        if (signedError) throw new Error(`Media export URL failed: ${signedError.message}`);
        mediaUrls.set(media.id, signed.signedUrl);
      }
    }

    return {
      schemaVersion: "1.0",
      generatedAt: new Date().toISOString(),
      disclaimer: "Community evidence for expert review; not a pollution diagnosis or safety determination.",
      incident,
      mediaUrls: Object.fromEntries(mediaUrls),
    };
  }
}
