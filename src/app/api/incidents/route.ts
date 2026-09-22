import { NextResponse } from "next/server";

import { incidentListQuerySchema } from "@/features/observations/contracts";
import { SupabaseIncidentReader } from "@/features/observations/repository";
import { consumeLocationReadQuota } from "@/features/locations/read-quota";
import { requireUser } from "@/lib/auth/require-user";
import { errorResponse } from "@/lib/http/respond";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export async function GET(request: Request) {
  try {
    const user = await requireUser();
    const query = incidentListQuerySchema.parse(
      Object.fromEntries(new URL(request.url).searchParams.entries()),
    );
    const supabase = await createSupabaseServerClient();
    await consumeLocationReadQuota(supabase, user.id, "incidents");
    const incidents = await new SupabaseIncidentReader(createSupabaseAdminClient()).list(query);
    return NextResponse.json({ incidents, pagination: { limit: query.limit, offset: query.offset } },
      { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    return errorResponse(error);
  }
}
