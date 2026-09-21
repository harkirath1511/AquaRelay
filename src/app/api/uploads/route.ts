import { NextResponse } from "next/server";

import { UploadRepository } from "@/features/uploads/repository";
import { UploadService } from "@/features/uploads/service";
import { requireUser } from "@/lib/auth/require-user";
import { errorResponse } from "@/lib/http/respond";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export async function POST(request: Request) {
  try {
    const user = await requireUser();
    const body: unknown = await request.json();
    const result = await new UploadService(
      new UploadRepository(createSupabaseAdminClient()),
    ).createIntent(user.id, body);
    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}
