import { describe, expect, it } from "vitest";
import { reportedLocationSchema, observationAnswersSchema, redactLocationText } from "./contracts";

describe("reported location privacy", () => {
  const valid = { latitude: 51.501234, longitude: -0.123456, source: "device", accuracyMeters: 15 };
  it.each([NaN, Infinity, -Infinity, 91])("rejects invalid latitude %s", (latitude) => {
    expect(reportedLocationSchema.safeParse({ ...valid, latitude }).success).toBe(false);
  });
  it.each([-1, Infinity, NaN, 10001])("rejects invalid accuracy %s", (accuracyMeters) => {
    expect(reportedLocationSchema.safeParse({ ...valid, accuracyMeters }).success).toBe(false);
  });
  it("requires a truthful source and device accuracy", () => {
    expect(reportedLocationSchema.safeParse({ ...valid, source: "gps" }).success).toBe(false);
    expect(reportedLocationSchema.safeParse({ ...valid, accuracyMeters: null }).success).toBe(false);
    expect(reportedLocationSchema.safeParse({ latitude: 51, longitude: 0 }).success).toBe(false);
    for (const source of ["map", "search"]) {
      expect(reportedLocationSchema.parse({ ...valid, source, accuracyMeters: null }).source).toBe(source);
    }
  });
  it("rejects alternate coordinate containers in survey answers", () => {
    expect(observationAnswersSchema.safeParse({ nested: { coordinates: [51.501234, -0.123456] } }).success).toBe(false);
    expect(observationAnswersSchema.parse({ conditionVisible: true })).toEqual({ conditionVisible: true });
  });
  it("redacts coordinate text and map URLs", () => {
    const text = redactLocationText("Foam at 51.501234, -0.123456 and 51, -1 https://maps.example/?q=51.501234");
    expect(text).not.toContain("51.501234");
    expect(text).not.toContain("-0.123456");
    expect(text).not.toContain("51, -1");
    expect(text).not.toContain("https://");
    expect(text).toContain("Foam");
  });
});
