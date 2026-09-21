import sharp from "sharp";
import { describe, expect, it } from "vitest";

import { sanitizeImage } from "./image";

describe("sanitizeImage", () => {
  it("returns a valid image without copied metadata", async () => {
    const source = await sharp({
      create: { width: 2, height: 2, channels: 3, background: "white" },
    })
      .jpeg()
      .withMetadata({ exif: { IFD0: { Artist: "Private author" } } })
      .toBuffer();

    const sanitized = await sanitizeImage(source);
    const metadata = await sharp(sanitized.buffer).metadata();

    expect(sanitized.contentType).toBe("image/jpeg");
    expect(sanitized.sha256).toMatch(/^[a-f0-9]{64}$/);
    expect(metadata.exif).toBeUndefined();
  });
});
