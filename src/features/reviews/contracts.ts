import { z } from "zod";

export const reviewDecisionSchema = z.enum([
  "request_more_evidence",
  "recommend_expert_review",
  "resolved",
  "explained",
]);

export const createReviewSchema = z.object({
  decision: reviewDecisionSchema,
  explanation: z.string().trim().min(1).max(4_000),
});

export type CreateReviewInput = z.infer<typeof createReviewSchema>;
