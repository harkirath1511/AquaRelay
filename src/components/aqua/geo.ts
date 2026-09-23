// PostgREST may serialize PostGIS geography as GeoJSON or hexadecimal EWKB.
// These are public approximate geometries, never a source for precise locations.
export function pointCoordinates(
  value: unknown,
): { coordinates: number[] } | undefined {
  if (typeof value === "object" && value !== null && "coordinates" in value) {
    const coordinates = (value as { coordinates: unknown }).coordinates;
    if (
      Array.isArray(coordinates) &&
      coordinates.length === 2 &&
      coordinates.every((v) => typeof v === "number" && Number.isFinite(v)) &&
      Math.abs(coordinates[0]) <= 180 &&
      Math.abs(coordinates[1]) <= 90
    )
      return { coordinates };
    return undefined;
  }
  if (typeof value !== "string") return undefined;
  const hex = value.replace(/^\\x/, "");
  if (!/^[a-f\d]+$/i.test(hex) || ![42, 50].includes(hex.length))
    return undefined;
  const bytes = Uint8Array.from(hex.match(/../g)!, (b) => parseInt(b, 16));
  const view = new DataView(bytes.buffer),
    little = bytes[0] === 1;
  if (bytes[0] !== 0 && bytes[0] !== 1) return undefined;
  const type = view.getUint32(1, little),
    hasSrid = (type & 0x20000000) !== 0;
  if ((type & 0x0fffffff) !== 1 || bytes.length !== (hasSrid ? 25 : 21))
    return undefined;
  if (hasSrid && view.getUint32(5, little) !== 4326) return undefined;
  const offset = hasSrid ? 9 : 5;
  return pointCoordinates({
    coordinates: [
      view.getFloat64(offset, little),
      view.getFloat64(offset + 8, little),
    ],
  });
}

export function normaliseLocations(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(normaliseLocations);
  if (typeof value !== "object" || value === null) return value;
  return Object.fromEntries(
    Object.entries(value).map(([key, item]) => [
      key,
      key === "location" || key === "target_location"
        ? pointCoordinates(item)
        : normaliseLocations(item),
    ]),
  );
}
