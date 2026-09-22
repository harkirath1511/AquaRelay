import { expect, it } from "vitest";
import { incidentListQuerySchema } from "./contracts";

it("bounds ordinary incident pagination to a small recent window", () => {
  expect(incidentListQuerySchema.parse({})).toMatchObject({ limit: 20, offset: 0 });
  expect(incidentListQuerySchema.safeParse({ limit: 21 }).success).toBe(false);
  expect(incidentListQuerySchema.safeParse({ offset: 101 }).success).toBe(false);
});
