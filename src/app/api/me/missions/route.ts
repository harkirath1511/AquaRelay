import { NextResponse } from "next/server";

import { requireUser } from "@/lib/auth/require-user";
import { errorResponse } from "@/lib/http/respond";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { attachMissionStories } from "@/features/missions/story";

export async function GET() {
  try {
    const user = await requireUser();
    // The database does not grant direct incident reads to participants. Scope
    // this service-role read to cases opened by the authenticated user.
    const client = createSupabaseAdminClient();
    const { data: incidents, error: incidentError } = await client
      .from("incidents")
      .select("id")
      .eq("created_by", user.id)
      .eq("is_demo", false)
      .neq("safety_state", "missions_paused")
      .is("resolved_at", null)
      .is("merged_into_incident_id", null);
    if (incidentError) throw new Error(`Your investigations failed: ${incidentError.message}`);

    const incidentIds = (incidents ?? []).map((incident) => incident.id);
    if (!incidentIds.length) {
      return NextResponse.json({ missions: [] }, { headers: { "Cache-Control": "private, no-store" } });
    }

    const now = new Date().toISOString();
    const { data: missions, error: missionError } = await client
      .from("missions")
      .select("id,incident_id,type,state,evidence_gap,instructions,safety_message,available_from")
      .in("incident_id", incidentIds)
      .eq("state", "open")
      .lte("available_from", now)
      .or(`due_at.is.null,due_at.gt.${now}`)
      .order("created_at", { ascending: false });
    if (missionError) throw new Error(`Your missions failed: ${missionError.message}`);

    return NextResponse.json(
      { missions: await attachMissionStories(client, missions ?? []) },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    return errorResponse(error);
  }
}
