import { afterEach, expect, it, vi } from "vitest";
import { readServerEnvironment } from "./env";

afterEach(() => vi.unstubAllEnvs());
it("treats a blank optional AI key as unavailable instead of rejecting the whole backend configuration", () => {
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://example.supabase.co");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "test-public-key");
  vi.stubEnv("GROQ_API_KEY", "");
  vi.stubEnv("GROQ_MODEL", "");
  expect(readServerEnvironment()).toMatchObject({
    GROQ_API_KEY: undefined,
    GROQ_MODEL: "qwen/qwen3.8-27b",
  });
});
