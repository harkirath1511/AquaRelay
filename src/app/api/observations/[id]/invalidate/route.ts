import { NextResponse } from "next/server";
import { z } from "zod";
import { requireReviewer } from "@/lib/auth/require-user";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { scheduleAssessment } from "@/features/assessments/run";
import { errorResponse } from "@/lib/http/respond";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const reviewer = await requireReviewer();
    const observationId = z.uuid().parse((await context.params).id);
    const { reason } = z.object({ reason: z.string().trim().min(10).max(1_000) }).strict().parse(await request.json());
    const client = await createSupabaseServerClient();
    const { data: incidentId, error } = await client.rpc("invalidate_observation", {
      p_observation_id: observationId, p_reason: reason,
    });
    if (error) throw new Error(`Observation was not invalidated: ${error.message}`);
    scheduleAssessment(client, incidentId, reviewer.id);
    return NextResponse.json({ incidentId });
  } catch (error) { return errorResponse(error); }
}
