import { NextResponse } from "next/server";
import { z } from "zod";
import { requireReviewer } from "@/lib/auth/require-user";
import { errorResponse } from "@/lib/http/respond";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    await requireReviewer();
    const incidentId = z.uuid().parse((await context.params).id);
    const client = await createSupabaseServerClient();
    const { data, error } = await client.rpc("list_location_audit", {
      p_incident_id: incidentId,
      p_limit: 100,
    });
    if (error) throw new Error("Could not read location audit");
    return NextResponse.json({ audit: data ?? [] }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    return errorResponse(error);
  }
}
