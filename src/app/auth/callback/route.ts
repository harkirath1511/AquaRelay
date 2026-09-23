import { NextResponse, type NextRequest } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { safeAccountNext } from "@/features/accounts/contracts";

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code");
  const tokenHash = request.nextUrl.searchParams.get("token_hash");
  const type = request.nextUrl.searchParams.get("type");
  const client = await createSupabaseServerClient();
  let ok = false;
  if (code) ok = !(await client.auth.exchangeCodeForSession(code)).error;
  else if (tokenHash && (type === "signup" || type === "recovery" || type === "invite" || type === "email")) {
    ok = !(await client.auth.verifyOtp({ token_hash: tokenHash, type })).error;
  }
  const next = type === "recovery" || type === "invite" ? "/account?flow=update-password" : safeAccountNext(request.nextUrl.searchParams.get("next"));
  const response = NextResponse.redirect(new URL(ok ? next : "/account?error=invalid-link", request.url));
  response.headers.set("Cache-Control", "private, no-store");
  response.headers.set("Referrer-Policy", "no-referrer");
  return response;
}
