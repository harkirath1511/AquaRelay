import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth/require-user";
import { errorResponse } from "@/lib/http/respond";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const holdSchema = z.object({
  until: z.iso.datetime({ offset: true }),
  reason: z.string().trim().min(10).max(500),
}).strict();

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    await requireAdmin();
    const incidentId = z.uuid().parse((await context.params).id);
    const body = holdSchema.parse(await request.json());
    const client = await createSupabaseServerClient();
    const { error } = await client.rpc("set_location_retention_hold", {
      p_incident_id: incidentId,
      p_until: body.until,
      p_reason: body.reason,
    });
    if (error) throw new Error("Could not set location retention hold");
    return NextResponse.json({ holdSet: true }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    return errorResponse(error);
  }
}
