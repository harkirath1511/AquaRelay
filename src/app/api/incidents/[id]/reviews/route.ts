import { NextResponse } from "next/server";

import { SupabaseReviewRepository } from "@/features/reviews/repository";
import { ReviewService } from "@/features/reviews/service";
import { requireReviewer } from "@/lib/auth/require-user";
import { errorResponse } from "@/lib/http/respond";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const reviewer = await requireReviewer();
    const { id } = await context.params;
    const body: unknown = await request.json();
    const supabase = await createSupabaseServerClient();
    const review = await new ReviewService(new SupabaseReviewRepository(supabase)).create(
      id,
      reviewer.id,
      body,
    );
    return NextResponse.json({ review }, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}
