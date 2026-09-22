import { NextResponse } from "next/server";
import { z } from "zod";

import { SupabaseIncidentReader } from "@/features/observations/repository";
import { consumeLocationReadQuota } from "@/features/locations/read-quota";
import { requireUser } from "@/lib/auth/require-user";
import { errorResponse } from "@/lib/http/respond";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

const incidentIdSchema = z.uuid();

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const user = await requireUser();
    const { id: unknownId } = await context.params;
    const id = incidentIdSchema.parse(unknownId);
    const supabase = await createSupabaseServerClient();
    await consumeLocationReadQuota(supabase, user.id, "incident_detail");
    const incident = await new SupabaseIncidentReader(createSupabaseAdminClient()).findById(id);

    if (!incident) {
      return NextResponse.json(
        { error: { code: "not_found", message: "Incident not found" } },
        { status: 404 },
      );
    }

    return NextResponse.json({ incident }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    return errorResponse(error);
  }
}
