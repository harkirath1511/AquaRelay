import type { SupabaseClient } from "@supabase/supabase-js";
import sharp from "sharp";

import type { EvidenceDecision } from "./rules";
import type { AssessmentClaim, AssessmentEvidence, AssessmentResult } from "./contracts";

export interface AssessmentRepository {
  claim(incidentId: string, userId: string): Promise<AssessmentClaim>;
  loadEvidence(incidentId: string): Promise<AssessmentEvidence>;
  complete(
    claim: AssessmentClaim,
    result: AssessmentResult,
    decision: EvidenceDecision,
    provider: { providerName: string; modelName: string },
  ): Promise<void>;
  fail(claim: AssessmentClaim, failureCode: string): Promise<void>;
}

interface ClaimRecord {
  assessment_id: string;
  evidence_revision: number;
  claimed: boolean;
}

export class AssessmentConflictError extends Error {
  readonly status = 409;

  constructor() {
    super("An assessment already exists for this evidence revision");
    this.name = "AssessmentConflictError";
  }
}

export class SupabaseAssessmentRepository implements AssessmentRepository {
  constructor(
    private readonly userClient: SupabaseClient,
    private readonly adminClient: SupabaseClient,
  ) {}

  async claim(incidentId: string, userId: string): Promise<AssessmentClaim> {
    const { data, error } = await this.userClient.rpc("claim_incident_assessment", {
      p_incident_id: incidentId,
      p_user_id: userId,
    });
    if (error) throw new Error(`Could not claim assessment: ${error.message}`);
    const record = (data as ClaimRecord[] | null)?.[0];
    if (!record) throw new Error("Assessment claim returned no result");
    if (!record.claimed) throw new AssessmentConflictError();
    return { assessmentId: record.assessment_id, evidenceRevision: record.evidence_revision };
  }

  async loadEvidence(incidentId: string): Promise<AssessmentEvidence> {
    const { data, error } = await this.adminClient
      .from("incidents")
      .select(
        "id, category, evidence_revision, observations(id, author_id, observed_at, description, answers, safety_flags, is_potential_duplicate, location_quality_flag, location_quality, location_conflicts, spatial_facts, invalidated_at, missions(type), media(id, object_path, mime_type, processing_state))",
      )
      .eq("id", incidentId)
      .single();
    if (error) throw new Error(`Could not load assessment evidence: ${error.message}`);

    const record = data as unknown as {
      id: string;
      category: string;
      evidence_revision: number;
      observations: Array<{
        id: string;
        author_id: string;
        observed_at: string;
        description: string;
        answers: Record<string, unknown>;
        safety_flags: string[];
        is_potential_duplicate: boolean;
        invalidated_at: string | null;
        location_quality_flag: string | null;
        location_quality: AssessmentEvidence["observations"][number]["locationQuality"];
        location_conflicts: string[];
        spatial_facts: AssessmentEvidence["observations"][number]["spatialFacts"];
        missions: { type: string } | null;
        media: Array<{
          id: string;
          object_path: string;
          mime_type: string;
          processing_state: string;
        }>;
      }>;
    };

    let remainingImages = 6;
    const observations: AssessmentEvidence["observations"] = [];
    for (const observation of record.observations) {
      const media: AssessmentEvidence["observations"][number]["media"] = [];
      for (const item of observation.media) {
        if (remainingImages <= 0 || item.processing_state !== "ready") continue;
        const { data: object, error: mediaError } = await this.adminClient.storage
          .from("observation-media")
          .download(item.object_path);
        if (mediaError) throw new Error(`Could not load assessment image: ${mediaError.message}`);
        const resized = await sharp(Buffer.from(await object.arrayBuffer()))
          .rotate()
          .resize({ width: 1_024, height: 1_024, fit: "inside", withoutEnlargement: true })
          .jpeg({ quality: 75 })
          .toBuffer();
        media.push({ id: item.id, mimeType: "image/jpeg", data: resized.toString("base64") });
        remainingImages -= 1;
      }

      observations.push({
        id: observation.id,
        authorId: observation.author_id,
        missionType: observation.missions?.type ?? null,
        observedAt: observation.observed_at,
        description: observation.description,
        answers: observation.answers,
        safetyFlags: observation.safety_flags,
        isPotentialDuplicate: observation.is_potential_duplicate,
        locationQualityFlag: observation.location_quality_flag,
        locationQuality: observation.location_quality,
        locationConflicts: observation.location_conflicts,
        spatialFacts: observation.spatial_facts,
        invalidatedAt: observation.invalidated_at,
        media,
      });
    }

    return {
      incidentId: record.id,
      category: record.category,
      evidenceRevision: record.evidence_revision,
      observations,
    };
  }

  async complete(
    claim: AssessmentClaim,
    result: AssessmentResult,
    decision: EvidenceDecision,
    provider: { providerName: string; modelName: string },
  ) {
    const { data, error } = await this.adminClient.rpc("complete_incident_assessment", {
      p_assessment_id: claim.assessmentId,
      p_evidence_revision: claim.evidenceRevision,
      p_result: result,
      p_status: decision.status,
      p_status_reasons: decision.reasons,
      p_pause_missions: decision.pauseMissions,
      p_model_provider: provider.providerName,
      p_model_name: provider.modelName,
    });
    if (error) throw new Error(`Could not complete assessment: ${error.message}`);
    if (data !== true) throw new Error("Evidence revision changed during assessment");
  }

  async fail(claim: AssessmentClaim, failureCode: string) {
    const { error } = await this.adminClient.rpc("fail_incident_assessment", {
      p_assessment_id: claim.assessmentId,
      p_failure_code: failureCode,
    });
    if (error) throw new Error(`Could not record assessment failure: ${error.message}`);
  }
}
