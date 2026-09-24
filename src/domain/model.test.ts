import { describe, expect, it } from "vitest";

import { coordinatesSchema, incidentCategorySchema, missionTypeSchema } from "./model";

describe("domain schemas", () => {
  it("accepts supported incident and mission types", () => {
    expect(incidentCategorySchema.parse("foam")).toBe("foam");
    expect(incidentCategorySchema.parse("air_quality")).toBe("air_quality");
    expect(incidentCategorySchema.parse("habitat_damage")).toBe("habitat_damage");
    expect(missionTypeSchema.parse("upstream_comparison")).toBe("upstream_comparison");
  });

  it("rejects coordinates outside geographic bounds", () => {
    expect(() => coordinatesSchema.parse({ latitude: 91, longitude: 10 })).toThrow();
    expect(() => coordinatesSchema.parse({ latitude: 10, longitude: -181 })).toThrow();
  });
});
