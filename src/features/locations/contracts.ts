import { z } from "zod";
import { coordinatesSchema } from "@/domain/model";

export const reportedLocationSchema = coordinatesSchema.extend({
  source: z.enum(["device", "map", "search"]),
  accuracyMeters: z.number().finite().min(0).max(10_000).nullable(),
  capturedAt: z.iso.datetime({ offset: true }),
}).strict().superRefine((location, ctx) => {
  if (location.source === "device" && location.accuracyMeters === null) {
    ctx.addIssue({ code: "custom", message: "Device locations require accuracyMeters", path: ["accuracyMeters"] });
  }
  const time = Date.parse(location.capturedAt);
  if (time > Date.now() + 5 * 60_000 || time < Date.now() - 30 * 86_400_000) {
    ctx.addIssue({ code: "custom", message: "Location capture time is outside the accepted window", path: ["capturedAt"] });
  }
});

// Only defined survey answers cross the public/AI boundary. Coordinates and
// arbitrary nested payloads do not belong in answers.
export const observationAnswersSchema = z.object({
  conditionVisible: z.boolean().optional(),
  persists: z.boolean().optional(),
  safeAccess: z.boolean().optional(),
}).strict().default({});

export const spatialFactsSchema = z.object({
  distanceFromOrigin: z.enum(["within_100m", "within_250m", "within_1km", "over_1km", "unknown"]),
  streamRelationship: z.enum(["same", "different", "unknown"]),
  flowRelationship: z.enum(["upstream", "downstream", "same_reach", "unknown"]),
  insideTargetRadius: z.boolean().nullable(),
}).strict();

export const locationConflictSchema = z.enum([
  "reported_stream_far_from_point",
  "label_stream_disagreement",
  "label_coordinate_disagreement",
  "capture_time_conflict",
  "repeated_identical_point",
  "outside_target_radius",
  "different_stream",
]);

export function redactLocationText(value: string): string {
  return value
    .replace(/https?:\/\/\S+/gi, "[link removed]")
    .replace(/[-+]?\d+\.\d+/g, "[number removed]")
    .replace(/[-+]?\d+\s*[,°]\s*[-+]?\d+(?:\s*[′'’]\s*\d+)?/g, "[coordinates removed]");
}
