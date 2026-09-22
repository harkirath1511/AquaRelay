import { z } from "zod";
import { coordinatesSchema } from "@/domain/model";

export const reportedLocationSchema = coordinatesSchema.extend({
  source: z.enum(["device", "map", "search"]),
  accuracyMeters: z.number().finite().min(0).max(10_000).nullable(),
}).strict().refine((location) => location.source !== "device" || location.accuracyMeters !== null, {
  message: "Device locations require accuracyMeters",
  path: ["accuracyMeters"],
});

// Only defined survey answers cross the public/AI boundary. Coordinates and
// arbitrary nested payloads do not belong in answers.
export const observationAnswersSchema = z.object({
  conditionVisible: z.boolean().optional(),
  persists: z.boolean().optional(),
  safeAccess: z.boolean().optional(),
}).strict().default({});

export function redactLocationText(value: string): string {
  return value
    .replace(/https?:\/\/\S+/gi, "[link removed]")
    .replace(/[-+]?\d+\.\d+/g, "[number removed]")
    .replace(/[-+]?\d+\s*[,°]\s*[-+]?\d+(?:\s*[′'’]\s*\d+)?/g, "[coordinates removed]");
}
