import { NextResponse } from "next/server";
import { z } from "zod";
import { requireReviewer } from "@/lib/auth/require-user";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { errorResponse } from "@/lib/http/respond";
import { consumeLocationReadQuota } from "@/features/locations/read-quota";

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const user = await requireReviewer();
    const id = z.uuid().parse((await context.params).id);
    const client = await createSupabaseServerClient();
    await consumeLocationReadQuota(client, user.id, "incident_detail");
    const { data, error } = await client.rpc("get_observation_location", {
      p_observation_id: id,
    });
    if (error) throw new Error("Location access failed");
    return NextResponse.json(
      { locations: data ?? [] },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    return errorResponse(error);
  }
}
