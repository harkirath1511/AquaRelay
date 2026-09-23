import { afterEach, expect, it, vi } from "vitest";
import { api, ApiError, uploadPhoto, type UploadProgress } from "./api";
afterEach(() => vi.unstubAllGlobals());
it("preserves API authorisation errors for permission-denied views", async () => {
  vi.stubGlobal(
    "fetch",
    vi
      .fn()
      .mockResolvedValue(
        Response.json(
          { error: { message: "Reviewer access is required" } },
          { status: 403 },
        ),
      ),
  );
  await expect(api("/api/reviews")).rejects.toMatchObject({
    status: 403,
    message: "Reviewer access is required",
  } as ApiError);
});
it("retries finalization without creating another media record or re-uploading", async () => {
  const fetcher = vi
    .fn()
    .mockResolvedValueOnce(
      Response.json({
        mediaId: "media-1",
        signedUrl: "https://example.test/signed-upload",
      }),
    )
    .mockResolvedValueOnce(new Response(null, { status: 200 }))
    .mockResolvedValueOnce(
      Response.json({ error: { message: "Temporary error" } }, { status: 503 }),
    )
    .mockResolvedValueOnce(Response.json({ state: "ready" }));
  vi.stubGlobal("fetch", fetcher);
  const photo = new File(["test image"], "stream.jpg", { type: "image/jpeg" });
  const checkpoint: UploadProgress = {};
  await expect(uploadPhoto(photo, "observation-1", checkpoint)).rejects.toThrow(
    "Temporary error",
  );
  await uploadPhoto(photo, "observation-1", checkpoint);
  expect(fetcher.mock.calls.map((c) => c[0])).toEqual([
    "/api/uploads",
    "https://example.test/signed-upload",
    "/api/uploads/media-1/complete",
    "/api/uploads/media-1/complete",
  ]);
});
