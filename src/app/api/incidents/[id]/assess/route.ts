import { NextResponse } from "next/server";
import { z } from "zod";

import { assessCurrentIncident } from "@/features/assessments/run";
import { requireUser } from "@/lib/auth/require-user";
import { errorResponse } from "@/lib/http/respond";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const incidentIdSchema = z.uuid();

export async function POST(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const user = await requireUser();
    const { id: unknownId } = await context.params;
    const incidentId = incidentIdSchema.parse(unknownId);
    const userClient = await createSupabaseServerClient();
    const result = await assessCurrentIncident(userClient, incidentId, user.id);
    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}
