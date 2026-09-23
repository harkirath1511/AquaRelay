import { z } from "zod";
import { requireReviewer } from "@/lib/auth/require-user";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { IncidentExportRepository } from "@/features/exports/repository";
import { renderIncidentReport } from "@/features/exports/print";
import { errorResponse } from "@/lib/http/respond";
export async function GET(_request:Request,context:{params:Promise<{id:string}>}) {
  try {
    await requireReviewer();
    const id=z.uuid().parse((await context.params).id);
    const report=await new IncidentExportRepository(createSupabaseAdminClient()).build(id);
    if(!report)return new Response("Incident not found",{status:404});
    const incident=report.incident as unknown as Parameters<typeof renderIncidentReport>[0];
    return new Response(renderIncidentReport(incident),{headers:{"Content-Type":"text/html; charset=utf-8","Cache-Control":"private, no-store","Referrer-Policy":"no-referrer","Content-Security-Policy":"default-src 'none'; style-src 'unsafe-inline'; frame-ancestors 'none'"}});
  }catch(error){return errorResponse(error);}
}
