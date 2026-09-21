import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

import { readPublicEnvironment } from "@/lib/config/env";

export async function createSupabaseServerClient() {
  const cookieStore = await cookies();
  const env = readPublicEnvironment();

  return createServerClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
    cookies: {
      getAll: () => cookieStore.getAll(),
      setAll: (cookiesToSet) => {
        try {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options),
          );
        } catch {
          // Server Components cannot set cookies. Middleware/Route Handlers refresh sessions.
        }
      },
    },
  });
}
