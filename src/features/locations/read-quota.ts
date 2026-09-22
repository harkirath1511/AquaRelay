import type { SupabaseClient } from "@supabase/supabase-js";

export class LocationReadLimitError extends Error {
  constructor() {
    super("Location read limit reached. Please try again tomorrow.");
    this.name = "LocationReadLimitError";
  }
}

export async function consumeLocationReadQuota(
  client: SupabaseClient,
  userId: string,
  scope: "incidents" | "incident_detail" | "missions",
) {
  const { error } = await client.rpc("consume_location_read_quota", {
    p_user_id: userId,
    p_scope: scope,
  });
  if (error?.message.includes("Location read limit reached")) throw new LocationReadLimitError();
  if (error) throw new Error("Could not check location read quota");
}
