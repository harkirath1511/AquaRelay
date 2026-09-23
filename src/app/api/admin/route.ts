import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth/require-user";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { roleChangeSchema } from "@/features/accounts/contracts";
import { errorResponse } from "@/lib/http/respond";

const actionSchema = z.discriminatedUnion("action", [
  roleChangeSchema.extend({ action: z.literal("role") }),
  z.object({ action: z.literal("pause"), incidentId: z.uuid(), reason: z.string().trim().min(10).max(1000) }).strict(),
]);
export async function GET(request: Request) {
  try {
    const user = await requireAdmin();
    const offset = z.coerce.number().int().min(0).max(10000).parse(new URL(request.url).searchParams.get("offset") ?? 0);
    const client = await createSupabaseServerClient();
    const [profiles, audit, incidents] = await Promise.all([
      client.from("profiles").select("id,display_name,role,created_at").order("created_at",{ascending:false}).range(offset,offset+49),
      client.from("admin_events").select("id,actor_id,target_user_id,incident_id,action,reason,previous_value,new_value,created_at").order("created_at",{ascending:false}).range(offset,offset+49),
      createSupabaseAdminClient().from("incidents").select("id,category,evidence_status,safety_state,updated_at,is_demo").eq("is_demo",false).order("updated_at",{ascending:false}).range(offset,offset+49),
    ]);
    if(profiles.error || audit.error || incidents.error) throw new Error("Administration data unavailable. Confirm all migrations are applied.");
    return NextResponse.json({ actorId:user.id,profiles:profiles.data,audit:audit.data,incidents:incidents.data,offset },{headers:{"Cache-Control":"private, no-store"}});
  } catch(error) { return errorResponse(error); }
}
export async function POST(request: Request) {
  try {
    const user = await requireAdmin();
    const input = actionSchema.parse(await request.json());
    if(input.action === "role" && input.userId === user.id) return NextResponse.json({error:{message:"You cannot change your own role."}},{status:400});
    const client = await createSupabaseServerClient();
    const { error } = input.action === "role"
      ? await client.rpc("admin_change_role",{p_user_id:input.userId,p_role:input.role,p_reason:input.reason})
      : await client.rpc("admin_pause_incident",{p_incident_id:input.incidentId,p_reason:input.reason});
    if(error) throw new Error("Administration action failed");
    return NextResponse.json({saved:true},{headers:{"Cache-Control":"private, no-store"}});
  } catch(error) { return errorResponse(error); }
}
