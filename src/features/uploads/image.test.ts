import sharp from "sharp";
import { describe, expect, it } from "vitest";

import { sanitizeImage, imageVisualHash, visuallySimilar } from "./image";

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

it("recognises a recompressed photograph without equating unrelated colours", async () => {
  const scene = await sharp({ create: { width: 64, height: 64, channels: 3, background: "#587e9a" } })
    .jpeg({ quality: 90 }).toBuffer();
  const recompressed = await sharp(scene).jpeg({ quality: 45 }).toBuffer();
  const different = await sharp({ create: { width: 64, height: 64, channels: 3, background: "#d54a2d" } })
    .jpeg().toBuffer();
  expect(visuallySimilar(await imageVisualHash(scene), await imageVisualHash(recompressed))).toBe(true);
  expect(visuallySimilar(await imageVisualHash(scene), await imageVisualHash(different))).toBe(false);
});
