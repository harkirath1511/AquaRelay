import { NextResponse } from "next/server";

import { ObservationService } from "@/features/observations/service";
import { SupabaseObservationRepository } from "@/features/observations/repository";
import { requireUser } from "@/lib/auth/require-user";
import { errorResponse } from "@/lib/http/respond";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { scheduleAssessment } from "@/features/assessments/run";

export async function POST(request: Request) {
  try {
    const user = await requireUser();
    const idempotencyKey = request.headers.get("Idempotency-Key") ?? "";
    const body: unknown = await request.json();
    const supabase = await createSupabaseServerClient();
    const service = new ObservationService(new SupabaseObservationRepository(supabase));
    const result = await service.submit(user.id, idempotencyKey, body);
    if (!result.replayed) scheduleAssessment(supabase, result.incidentId, user.id);

    return NextResponse.json(result, { status: result.replayed ? 200 : 201 });
  } catch (error) {
    return errorResponse(error);
  }
}
