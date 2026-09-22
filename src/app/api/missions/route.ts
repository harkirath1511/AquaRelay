import { NextResponse } from "next/server";

import { SupabaseMissionRepository } from "@/features/missions/repository";
import { MissionService } from "@/features/missions/service";
import { consumeLocationReadQuota } from "@/features/locations/read-quota";
import { requireUser } from "@/lib/auth/require-user";
import { errorResponse } from "@/lib/http/respond";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function GET(request: Request) {
  try {
    await requireUser();
    void request;
    return NextResponse.json({ error: { code: "body_required", message: "Use POST with a bounded JSON location search" } },
      { status: 405, headers: { Allow: "POST" } });
  } catch (error) {
    return errorResponse(error);
  }
}

// Coordinates belong in a body, never URLs retained in access logs/history.
export async function POST(request: Request) {
  try {
    const user = await requireUser();
    const query = await request.json();
    await consumeLocationReadQuota(await createSupabaseServerClient(), user.id, "missions");
    const missions = await new MissionService(new SupabaseMissionRepository(createSupabaseAdminClient())).list(user.id, query);
    return NextResponse.json({ missions }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    return errorResponse(error);
  }
}
