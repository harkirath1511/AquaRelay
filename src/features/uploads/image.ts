import { createHash } from "node:crypto";

import sharp from "sharp";

const formats = {
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
} as const;

export async function sanitizeImage(input: Buffer) {
  const image = sharp(input, { failOn: "warning", limitInputPixels: 40_000_000 });
  const metadata = await image.metadata();
  const format = metadata.format as keyof typeof formats | undefined;
  if (!format || !formats[format]) throw new Error("Unsupported image format");

  const buffer = await image.rotate().toFormat(format).toBuffer();
  return {
    buffer,
    contentType: formats[format],
    sha256: createHash("sha256").update(buffer).digest("hex"),
  };
}
