import { NextResponse } from "next/server";

import { SupabaseMissionRepository } from "@/features/missions/repository";
import { MissionService } from "@/features/missions/service";
import { requireUser } from "@/lib/auth/require-user";
import { errorResponse } from "@/lib/http/respond";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export async function GET(request: Request) {
  try {
    await requireUser();
    const query = Object.fromEntries(new URL(request.url).searchParams.entries());
    if ("latitude" in query || "longitude" in query) {
      return NextResponse.json({ error: { code: "body_required", message: "Use POST with a JSON body for nearby searches" } }, { status: 400 });
    }
    const supabase = createSupabaseAdminClient();
    const missions = await new MissionService(new SupabaseMissionRepository(supabase)).list(query);
    return NextResponse.json({ missions }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    return errorResponse(error);
  }
}

// Coordinates belong in a body, never URLs retained in access logs/history.
export async function POST(request: Request) {
  try {
    await requireUser();
    const query = await request.json();
    const missions = await new MissionService(new SupabaseMissionRepository(createSupabaseAdminClient())).list(query);
    return NextResponse.json({ missions }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    return errorResponse(error);
  }
}
