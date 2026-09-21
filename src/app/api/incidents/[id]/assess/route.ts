import { NextResponse } from "next/server";
import { z } from "zod";

import { GeminiAssessmentProvider } from "@/features/assessments/gemini-provider";
import { SupabaseAssessmentRepository } from "@/features/assessments/repository";
import { AssessmentService } from "@/features/assessments/service";
import { requireUser } from "@/lib/auth/require-user";
import { readServerEnvironment } from "@/lib/config/env";
import { errorResponse } from "@/lib/http/respond";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const incidentIdSchema = z.uuid();

export async function POST(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const user = await requireUser();
    const { id: unknownId } = await context.params;
    const incidentId = incidentIdSchema.parse(unknownId);
    const env = readServerEnvironment();
    if (!env.GEMINI_API_KEY) throw new Error("GEMINI_API_KEY is required for assessment");

    const userClient = await createSupabaseServerClient();
    const repository = new SupabaseAssessmentRepository(
      userClient,
      createSupabaseAdminClient(),
    );
    const provider = new GeminiAssessmentProvider(env.GEMINI_API_KEY, env.GEMINI_MODEL);
    const result = await new AssessmentService(repository, provider).assess(incidentId, user.id);
    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}
