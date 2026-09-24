import { NextResponse } from "next/server";
import { z } from "zod";
import { assessCurrentIncident } from "@/features/assessments/run";
import { requireUser } from "@/lib/auth/require-user";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { errorResponse } from "@/lib/http/respond";

export async function POST(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser();
    const incidentId = z.uuid().parse((await context.params).id);
    const client = await createSupabaseServerClient();
    const { error } = await client.rpc("request_legacy_assessment_retry", { p_incident_id: incidentId });
    if (error) throw new Error(`Could not request reassessment: ${error.message}`);
    const assessment = await assessCurrentIncident(client, incidentId, user.id);
    return NextResponse.json(assessment, { status: 201, headers: { "Cache-Control": "private, no-store" } });
  } catch (error) { return errorResponse(error); }
}
