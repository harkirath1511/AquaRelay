// Source: Natural Earth 1:110m land, public domain.
// https://github.com/nvkelso/natural-earth-vector/tree/master/geojson
import { readFile, writeFile } from "node:fs/promises";
import sharp from "sharp";

const width = 2048;
const height = 1024;
const source = JSON.parse(await readFile("scripts/data/ne_110m_land.geojson", "utf8"));
const x = (longitude) => ((longitude + 180) / 360) * width;
const y = (latitude) => ((90 - latitude) / 180) * height;
const paths = source.features.flatMap(({ geometry }) =>
  geometry.coordinates.map((ring) =>
    `M ${ring.map(([longitude, latitude]) => `${x(longitude).toFixed(2)} ${y(latitude).toFixed(2)}`).join(" L ")} Z`,
  ),
);
const maskSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><path fill="#fff" fill-rule="evenodd" d="${paths.join(" ")}"/></svg>`;
const mask = await sharp(Buffer.from(maskSvg)).ensureAlpha().raw().toBuffer();
const pixels = Buffer.alloc(width * height * 4);

for (let py = 0; py < height; py++) {
  for (let px = 0; px < width; px++) {
    const i = (py * width + px) * 4;
    const land = mask[i + 3] / 255;
    const ripple = Math.sin(px * 0.059 + Math.sin(py * 0.045) * 2) * 0.5
      + Math.sin(py * 0.14 + px * 0.017) * 0.25;
    const grain = Math.sin(px * 0.77 + py * 1.17) * Math.sin(py * 0.69 - px * 0.37);
    const moss = 0.5 + 0.5 * Math.sin(px * 0.025 + Math.cos(py * 0.034) * 3);
    const sparkle = land > 0.5 && grain > 0.79 ? 32 : 0;
    const ocean = [188 + ripple * 5, 220 + ripple * 6, 216 + ripple * 6];
    const terrain = [83 + moss * 30 + grain * 12 + sparkle,
      137 + moss * 31 + grain * 13 + sparkle,
      107 + moss * 22 + grain * 9 + sparkle];
    for (let channel = 0; channel < 3; channel++) {
      pixels[i + channel] = Math.max(0, Math.min(255,
        ocean[channel] * (1 - land) + terrain[channel] * land));
    }
    pixels[i + 3] = 255;
  }
}

await writeFile("public/images/globe-texture-light.webp",
  await sharp(pixels, { raw: { width, height, channels: 4 } }).webp({ quality: 82 }).toBuffer());
