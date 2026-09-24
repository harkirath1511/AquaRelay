import { NextResponse } from "next/server";
import { z } from "zod";
import { incidentCategorySchema, coordinatesSchema } from "@/domain/model";
import { requireUser } from "@/lib/auth/require-user";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { consumeLocationReadQuota } from "@/features/locations/read-quota";
import { errorResponse } from "@/lib/http/respond";

const querySchema = z.object({ category: incidentCategorySchema, location: coordinatesSchema }).strict();

export async function POST(request: Request) {
  try {
    const user = await requireUser();
    const input = querySchema.parse(await request.json());
    await consumeLocationReadQuota(await createSupabaseServerClient(), user.id, "incidents");
    const { data, error } = await createSupabaseAdminClient().rpc("list_possible_incidents", {
      p_latitude: input.location.latitude,
      p_longitude: input.location.longitude,
      p_category: input.category,
    });
    if (error) throw new Error("Could not check nearby investigations");
    return NextResponse.json({ cases: data ?? [] }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    return errorResponse(error);
  }
}
