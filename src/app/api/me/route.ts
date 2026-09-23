import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth/require-user";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { errorResponse } from "@/lib/http/respond";
import { profileUpdateSchema } from "@/features/accounts/contracts";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export async function GET() {
  try {
    const user = await requireUser();
    const client = await createSupabaseServerClient();
    const [profile, contributions, impact] = await Promise.all([
      client.from("profiles").select("id,display_name,role,created_at").eq("id", user.id).single(),
      createSupabaseAdminClient().from("observations").select("id,incident_id,category,description,observed_at,is_potential_duplicate,incidents(evidence_status,resolved_at)").eq("author_id", user.id).order("submitted_at", { ascending: false }).limit(50),
      client.from("impact_events").select("id,incident_id,reason,points,reverses_event_id,created_at").eq("contributor_id", user.id).order("created_at", { ascending: false }).limit(100),
    ]);
    if (profile.error || contributions.error || impact.error) throw new Error("Could not load account details");
    return NextResponse.json({ user: { id: user.id, email: user.email }, profile: profile.data, contributions: contributions.data, impact: impact.data }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) { return errorResponse(error); }
}

export async function PATCH(request: Request) {
  try {
    const user = await requireUser();
    const input = profileUpdateSchema.parse(await request.json());
    const client = await createSupabaseServerClient();
    const { error } = await client.from("profiles").update({ display_name: input.displayName }).eq("id", user.id);
    if (error) throw new Error("Could not update display name");
    return NextResponse.json({ saved: true }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) { return errorResponse(error); }
}
