import { NextResponse } from "next/server";

import { SupabaseMissionRepository } from "@/features/missions/repository";
import { MissionService } from "@/features/missions/service";
import { requireUser } from "@/lib/auth/require-user";
import { errorResponse } from "@/lib/http/respond";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function GET(request: Request) {
  try {
    await requireUser();
    const query = Object.fromEntries(new URL(request.url).searchParams.entries());
    const supabase = await createSupabaseServerClient();
    const missions = await new MissionService(new SupabaseMissionRepository(supabase)).list(query);
    return NextResponse.json({ missions });
  } catch (error) {
    return errorResponse(error);
  }
}
