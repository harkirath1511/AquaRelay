import { expect, it } from "vitest";
import { pointCoordinates, normaliseLocations } from "./geo";
it("reads PostGIS points without dropping the SRID offset", () => {
  const bytes = new Uint8Array(25),
    view = new DataView(bytes.buffer);
  bytes[0] = 1;
  view.setUint32(1, 0x20000001, true);
  view.setUint32(5, 4326, true);
  view.setFloat64(9, 77.595, true);
  view.setFloat64(17, 12.975, true);
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join(
    "",
  );
  expect(pointCoordinates(hex)).toEqual({ coordinates: [77.595, 12.975] });
  expect(
    normaliseLocations({ incidents: [{ location: hex }], label: "Millbrook" }),
  ).toEqual({
    incidents: [{ location: { coordinates: [77.595, 12.975] } }],
    label: "Millbrook",
  });
});
it("does not plot malformed, non-geographic or non-point data", () => {
  expect(pointCoordinates("not a point")).toBeUndefined();
  expect(pointCoordinates({ coordinates: [200, 12] })).toBeUndefined();
  expect(pointCoordinates({ coordinates: [12, Number.NaN] })).toBeUndefined();
  expect(pointCoordinates({ coordinates: [77.595, 12.975] })).toEqual({
    coordinates: [77.595, 12.975],
  });
});
