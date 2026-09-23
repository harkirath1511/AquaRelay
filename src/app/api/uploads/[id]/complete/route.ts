import { after, NextResponse } from "next/server";

import { UploadRepository } from "@/features/uploads/repository";
import { UploadService } from "@/features/uploads/service";
import { requireUser } from "@/lib/auth/require-user";
import { errorResponse } from "@/lib/http/respond";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { assessCurrentIncident } from "@/features/assessments/run";

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
    if (!result.replayed) {
      const client = await createSupabaseServerClient();
      after(async () => {
        try {
          const { data, error } = await createSupabaseAdminClient().from("media")
            .select("observations(incident_id)").eq("id", id).eq("owner_id", user.id).single();
          if (error) throw error;
          const observation = data.observations as unknown as { incident_id: string };
          await assessCurrentIncident(client, observation.incident_id, user.id);
        } catch { console.warn("Photo saved; assessment could not be completed."); }
      });
    }
    return NextResponse.json(result);
  } catch (error) {
    return errorResponse(error);
  }
}
