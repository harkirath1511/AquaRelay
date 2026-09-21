import { createClient } from "@supabase/supabase-js";

import { readServerEnvironment } from "@/lib/config/env";

export function createSupabaseAdminClient() {
  const env = readServerEnvironment();

  if (!env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error("SUPABASE_SERVICE_ROLE_KEY is required for this operation");
  }

  return createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
