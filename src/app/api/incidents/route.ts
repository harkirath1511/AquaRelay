import { NextResponse } from "next/server";

import { incidentListQuerySchema } from "@/features/observations/contracts";
import { SupabaseIncidentReader } from "@/features/observations/repository";
import { requireUser } from "@/lib/auth/require-user";
import { errorResponse } from "@/lib/http/respond";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function GET(request: Request) {
  try {
    await requireUser();
    const query = incidentListQuerySchema.parse(
      Object.fromEntries(new URL(request.url).searchParams.entries()),
    );
    const supabase = await createSupabaseServerClient();
    const incidents = await new SupabaseIncidentReader(supabase).list(query);
    return NextResponse.json({ incidents, pagination: { limit: query.limit, offset: query.offset } });
  } catch (error) {
    return errorResponse(error);
  }
}
