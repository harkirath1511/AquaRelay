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
  const visualHash = await imageVisualHash(buffer);
  return {
    buffer,
    contentType: formats[format],
    sha256: createHash("sha256").update(buffer).digest("hex"),
    visualHash,
  };
}

export async function imageVisualHash(buffer: Buffer) {
  const { data, info } = await sharp(buffer).resize(9, 8, { fit: "fill" })
    .removeAlpha().raw().toBuffer({ resolveWithObject: true });
  if (info.channels !== 3) throw new Error("Could not read image colours");
  let differences = BigInt(0);
  const sums = [0, 0, 0];
  for (let y = 0; y < 8; y++) {
    for (let x = 0; x < 9; x++) {
      const offset = (y * 9 + x) * 3;
      for (let channel = 0; channel < 3; channel++) sums[channel] += data[offset + channel];
      if (x === 8) continue;
      const next = offset + 3;
      const luminance = (index: number) => data[index] * 299 + data[index + 1] * 587 + data[index + 2] * 114;
      differences = (differences << BigInt(1)) | BigInt(luminance(offset) > luminance(next) ? 1 : 0);
    }
  }
  return differences.toString(16).padStart(16, "0")
    + sums.map((sum) => Math.round(sum / 72).toString(16).padStart(2, "0")).join("");
}

export function visuallySimilar(left: string, right: string) {
  if (!/^[0-9a-f]{22}$/.test(left) || !/^[0-9a-f]{22}$/.test(right)) return false;
  let bits = BigInt(`0x${left.slice(0, 16)}`) ^ BigInt(`0x${right.slice(0, 16)}`);
  let difference = 0;
  while (bits) { difference += Number(bits & BigInt(1)); bits >>= BigInt(1); }
  return difference <= 5 && [0, 2, 4].every((offset) =>
    Math.abs(parseInt(left.slice(16 + offset, 18 + offset), 16)
      - parseInt(right.slice(16 + offset, 18 + offset), 16)) <= 24);
}
