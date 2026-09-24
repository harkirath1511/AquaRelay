import { NextResponse } from "next/server";
import { z } from "zod";
import { coordinatesSchema } from "@/domain/model";
import { requireReviewer } from "@/lib/auth/require-user";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { errorResponse } from "@/lib/http/respond";

const inputSchema = z.object({
  type: z.enum(["upstream_comparison", "downstream_comparison", "unaffected_comparison"]),
  target: coordinatesSchema,
  safeViewpointConfirmed: z.literal(true),
  reason: z.string().trim().min(10).max(2_000),
  baselineObservationId: z.uuid().nullable().optional(),
}).strict();

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    await requireReviewer();
    const incidentId = z.uuid().parse((await context.params).id);
    const input = inputSchema.parse(await request.json());
    const { data, error } = await (await createSupabaseServerClient()).rpc("plan_comparison_mission", {
      p_incident_id: incidentId,
      p_type: input.type,
      p_latitude: input.target.latitude,
      p_longitude: input.target.longitude,
      p_safe_viewpoint_confirmed: true,
      p_reason: input.reason,
      p_baseline_observation_id: input.baselineObservationId ?? null,
    });
    if (error) throw new Error(`Comparison mission was not created: ${error.message}`);
    return NextResponse.json({ missionId: data }, { status: 201 });
  } catch (error) { return errorResponse(error); }
}
