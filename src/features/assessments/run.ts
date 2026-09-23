import type { SupabaseClient } from "@supabase/supabase-js";
import { after } from "next/server";
import { readServerEnvironment } from "@/lib/config/env";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { GeminiAssessmentProvider } from "./gemini-provider";
import {
  SupabaseAssessmentRepository,
  AssessmentConflictError,
} from "./repository";
import { AssessmentService } from "./service";
import type { AssessmentProvider } from "./provider";

export async function assessCurrentIncident(
  client: SupabaseClient,
  incidentId: string,
  userId: string,
) {
  const env = readServerEnvironment();
  const unavailable: AssessmentProvider = {
    providerName: "unavailable",
    modelName: "unconfigured",
    assess: async () => {
      throw new Error("Assessment provider is not configured");
    },
  };
  const provider = env.GEMINI_API_KEY
    ? new GeminiAssessmentProvider(env.GEMINI_API_KEY, env.GEMINI_MODEL)
    : unavailable;
  return new AssessmentService(
    new SupabaseAssessmentRepository(client, createSupabaseAdminClient()),
    provider,
  ).assess(incidentId, userId);
}
export function scheduleAssessment(
  client: SupabaseClient,
  incidentId: string,
  userId: string,
) {
  after(async () => {
    try {
      await assessCurrentIncident(client, incidentId, userId);
    } catch (error) {
      if (!(error instanceof AssessmentConflictError))
        console.warn(
          "Assessment unavailable; saved observations remain intact.",
        );
    }
  });
}
