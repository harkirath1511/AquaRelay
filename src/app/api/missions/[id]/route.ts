import { NextResponse } from "next/server";
import { z } from "zod";

import { requireUser } from "@/lib/auth/require-user";
import { errorResponse } from "@/lib/http/respond";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

const missionIdSchema = z.uuid();
const unavailable = () => NextResponse.json(
  { error: { code: "not_found", message: "This mission is unavailable" } },
  { status: 404, headers: { "Cache-Control": "private, no-store" } },
);

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    await requireUser();
    const id = missionIdSchema.parse((await context.params).id);
    const client = createSupabaseAdminClient();
    // Only task text and category are needed by the response form. Never read
    // exact or approximate location fields into this response.
    const { data: mission, error: missionError } = await client
      .from("missions")
      .select("id,incident_id,type,state,evidence_gap,instructions,safety_message,available_from,due_at")
      .eq("id", id)
      .maybeSingle();
    if (missionError) throw new Error(`Mission lookup failed: ${missionError.message}`);
    if (!mission || mission.state !== "open" || Date.parse(mission.available_from) > Date.now()
      || (mission.due_at && Date.parse(mission.due_at) <= Date.now())) return unavailable();

    const { data: incident, error: incidentError } = await client
      .from("incidents")
      .select("category,is_demo,safety_state,resolved_at,merged_into_incident_id")
      .eq("id", mission.incident_id)
      .maybeSingle();
    if (incidentError) throw new Error(`Mission investigation lookup failed: ${incidentError.message}`);
    if (!incident || incident.is_demo || incident.safety_state === "missions_paused"
      || incident.resolved_at || incident.merged_into_incident_id) return unavailable();

    return NextResponse.json({ mission: {
      id: mission.id,
      incident_id: mission.incident_id,
      type: mission.type,
      category: incident.category,
      evidence_gap: mission.evidence_gap,
      instructions: mission.instructions,
      safety_message: mission.safety_message,
    } }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    return errorResponse(error);
  }
}
