import { NextResponse } from "next/server";
import { z } from "zod";
import { requireReviewer } from "@/lib/auth/require-user";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { errorResponse } from "@/lib/http/respond";
import { scheduleAssessment } from "@/features/assessments/run";

const inputSchema = z.object({
  targetId: z.uuid(),
  reason: z.string().trim().min(20).max(2_000),
  sameWaterwayConfirmed: z.literal(true),
}).strict();

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const reviewer = await requireReviewer();
    const sourceId = z.uuid().parse((await context.params).id);
    const input = inputSchema.parse(await request.json());
    const client = await createSupabaseServerClient();
    const { data, error } = await client.rpc("merge_related_incidents", {
      p_source_id: sourceId,
      p_target_id: input.targetId,
      p_reason: input.reason,
      p_same_waterway_confirmed: true,
    });
    if (error) throw new Error(`Cases were not merged: ${error.message}`);
    scheduleAssessment(client, input.targetId, reviewer.id);
    return NextResponse.json({ targetId: input.targetId, evidenceRevision: data },
      { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) { return errorResponse(error); }
}
