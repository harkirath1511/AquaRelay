import { NextResponse } from "next/server";

import { requireUser } from "@/lib/auth/require-user";
import { errorResponse } from "@/lib/http/respond";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function GET() {
  try {
    const user = await requireUser();
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase
      .from("impact_events")
      .select("id, incident_id, observation_id, gap_key, points, reason, reverses_event_id, created_at")
      .eq("contributor_id", user.id)
      .order("created_at", { ascending: false });
    if (error) throw new Error(`Impact history failed: ${error.message}`);
    const total = (data ?? []).reduce((sum, event) => sum + event.points, 0);
    return NextResponse.json({ total, events: data ?? [] });
  } catch (error) {
    return errorResponse(error);
  }
}
