import { NextResponse } from "next/server";

import { requireUser } from "@/lib/auth/require-user";
import { errorResponse } from "@/lib/http/respond";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function GET() {
  try {
    const user = await requireUser();
    const supabase = await createSupabaseServerClient();
    const [impact, contributions] = await Promise.all([
      supabase.from("impact_events")
        .select("id, incident_id, observation_id, gap_key, points, reason, reverses_event_id, created_at")
        .eq("contributor_id", user.id)
        .order("created_at", { ascending: false }),
      // Direct observation reads are restricted. The server scopes this admin read
      // to the authenticated reporter and selects no coordinates or evidence text.
      createSupabaseAdminClient().from("observations")
        .select("id, incident_id, mission_id, category, submitted_at, location_quality, location_quality_flag, is_potential_duplicate, invalidated_at")
        .eq("author_id", user.id)
        .order("submitted_at", { ascending: false })
        .limit(100),
    ]);
    if (impact.error) throw new Error(`Impact history failed: ${impact.error.message}`);
    if (contributions.error) throw new Error(`Contribution history failed: ${contributions.error.message}`);
    const total = (impact.data ?? []).reduce((sum, event) => sum + event.points, 0);
    return NextResponse.json(
      { total, events: impact.data ?? [], contributions: contributions.data ?? [] },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    return errorResponse(error);
  }
}
