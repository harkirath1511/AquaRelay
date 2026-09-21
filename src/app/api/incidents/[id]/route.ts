import { NextResponse } from "next/server";
import { z } from "zod";

import { SupabaseIncidentReader } from "@/features/observations/repository";
import { requireUser } from "@/lib/auth/require-user";
import { errorResponse } from "@/lib/http/respond";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const incidentIdSchema = z.uuid();

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    await requireUser();
    const { id: unknownId } = await context.params;
    const id = incidentIdSchema.parse(unknownId);
    const supabase = await createSupabaseServerClient();
    const incident = await new SupabaseIncidentReader(supabase).findById(id);

    if (!incident) {
      return NextResponse.json(
        { error: { code: "not_found", message: "Incident not found" } },
        { status: 404 },
      );
    }

    return NextResponse.json({ incident });
  } catch (error) {
    return errorResponse(error);
  }
}
