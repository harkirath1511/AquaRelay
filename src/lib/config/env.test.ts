import { afterEach, expect, it, vi } from "vitest";
import { readServerEnvironment } from "./env";

afterEach(() => vi.unstubAllEnvs());
it("treats a blank optional AI key as unavailable instead of rejecting the whole backend configuration", () => {
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://example.supabase.co");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "test-public-key");
  vi.stubEnv("GEMINI_API_KEY", "");
  vi.stubEnv("GEMINI_MODEL", "");
  expect(readServerEnvironment()).toMatchObject({
    GEMINI_API_KEY: undefined,
    GEMINI_MODEL: "gemini-2.5-flash",
  });
});
