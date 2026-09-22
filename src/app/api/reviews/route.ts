import { NextResponse } from "next/server";
import { z } from "zod";

import { SupabaseReviewRepository } from "@/features/reviews/repository";
import { requireReviewer } from "@/lib/auth/require-user";
import { errorResponse } from "@/lib/http/respond";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

const querySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(25),
  offset: z.coerce.number().int().min(0).default(0),
});

export async function GET(request: Request) {
  try {
    await requireReviewer();
    const query = querySchema.parse(Object.fromEntries(new URL(request.url).searchParams.entries()));
    const supabase = createSupabaseAdminClient();
    const incidents = await new SupabaseReviewRepository(supabase).queue(query.limit, query.offset);
    return NextResponse.json({ incidents, pagination: query });
  } catch (error) {
    return errorResponse(error);
  }
}
