import { NextResponse } from "next/server";
import { z } from "zod";

import { IncidentExportRepository } from "@/features/exports/repository";
import { requireReviewer } from "@/lib/auth/require-user";
import { errorResponse } from "@/lib/http/respond";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

const idSchema = z.uuid();

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    await requireReviewer();
    const { id: unknownId } = await context.params;
    const incidentId = idSchema.parse(unknownId);
    const report = await new IncidentExportRepository(createSupabaseAdminClient()).build(incidentId);
    if (!report) {
      return NextResponse.json(
        { error: { code: "not_found", message: "Incident not found" } },
        { status: 404 },
      );
    }
    return NextResponse.json(report, {
      headers: { "Content-Disposition": `attachment; filename="aquarelay-${incidentId}.json"` },
    });
  } catch (error) {
    return errorResponse(error);
  }
}
