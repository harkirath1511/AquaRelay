import { NextResponse } from "next/server";

import { UploadRepository } from "@/features/uploads/repository";
import { UploadService } from "@/features/uploads/service";
import { requireUser } from "@/lib/auth/require-user";
import { errorResponse } from "@/lib/http/respond";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export async function POST(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const user = await requireUser();
    const { id } = await context.params;
    const result = await new UploadService(
      new UploadRepository(createSupabaseAdminClient()),
    ).complete(user.id, id);
    return NextResponse.json(result);
  } catch (error) {
    return errorResponse(error);
  }
}
