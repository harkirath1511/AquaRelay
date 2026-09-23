import { z } from "zod";
import { missionTypeSchema } from "@/domain/model";

export const reviewDecisionSchema = z.enum([
  "request_more_evidence",
  "recommend_expert_review",
  "resolved",
  "explained",
]);

export const createReviewSchema = z
  .object({
    decision: reviewDecisionSchema,
    explanation: z.string().trim().min(1).max(4_000),
    requestedMissionTypes: z.array(missionTypeSchema).max(3).default([]),
  })
  .strict()
  .superRefine((input, ctx) => {
    if (
      input.requestedMissionTypes.length &&
      input.decision !== "request_more_evidence"
    )
      ctx.addIssue({
        code: "custom",
        path: ["requestedMissionTypes"],
        message: "Missions require a request for more evidence",
      });
    if (
      new Set(input.requestedMissionTypes).size !==
      input.requestedMissionTypes.length
    )
      ctx.addIssue({
        code: "custom",
        path: ["requestedMissionTypes"],
        message: "Choose each mission type once",
      });
  });

export type CreateReviewInput = z.infer<typeof createReviewSchema>;
