import { NextResponse } from "next/server";

import { SupabaseMissionRepository } from "@/features/missions/repository";
import { MissionService } from "@/features/missions/service";
import { requireUser } from "@/lib/auth/require-user";
import { errorResponse } from "@/lib/http/respond";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const user = await requireUser();
    const { id } = await context.params;
    const idempotencyKey = request.headers.get("Idempotency-Key") ?? "";
    const body: unknown = await request.json();
    const supabase = await createSupabaseServerClient();
    const result = await new MissionService(new SupabaseMissionRepository(supabase)).respond(
      id,
      user.id,
      idempotencyKey,
      body,
    );
    return NextResponse.json(result, { status: result.replayed ? 200 : 201 });
  } catch (error) {
    return errorResponse(error);
  }
}
