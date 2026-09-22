import { NextResponse } from "next/server";
import { z } from "zod";
import { reportedLocationSchema } from "@/features/locations/contracts";
import { requireReviewer } from "@/lib/auth/require-user";
import { errorResponse } from "@/lib/http/respond";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const correctionSchema = z.object({
  location: reportedLocationSchema,
  reason: z.string().trim().min(5).max(500),
}).strict();

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    await requireReviewer();
    const observationId = z.uuid().parse((await context.params).id);
    const body = correctionSchema.parse(await request.json());
    const client = await createSupabaseServerClient();
    const { error } = await client.rpc("correct_observation_location", {
      p_observation_id: observationId,
      p_latitude: body.location.latitude,
      p_longitude: body.location.longitude,
      p_accuracy_meters: body.location.accuracyMeters,
      p_location_source: body.location.source,
      p_captured_at: body.location.capturedAt,
      p_reason: body.reason,
    });
    if (error) throw new Error("Could not correct observation location");
    return NextResponse.json({ corrected: true }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    return errorResponse(error);
  }
}
