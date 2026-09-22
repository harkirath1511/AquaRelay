import { afterEach, expect, it, vi } from "vitest";
import { z } from "zod";
import { errorResponse } from "./respond";

afterEach(() => vi.restoreAllMocks());
it("does not log database errors containing exact locations", async () => {
  const log = vi.spyOn(console, "error").mockImplementation(() => {});
  const response = errorResponse(new Error("SQL failed at POINT(-0.123456 51.501234)"));
  expect(response.status).toBe(500);
  expect(JSON.stringify(await response.json())).not.toContain("51.501234");
  expect(log).toHaveBeenCalledExactlyOnceWith("Backend request failed");
});
it("does not echo untrusted validation paths or input", async () => {
  const parsed = z.object({ secret: z.enum(["device"]) }).safeParse({ secret: "51.501234" });
  const response = errorResponse(parsed.error);
  expect(JSON.stringify(await response.json())).not.toContain("51.501234");
});
