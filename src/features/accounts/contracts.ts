import { z } from "zod";
export const profileUpdateSchema = z.object({ displayName: z.string().trim().min(1).max(80) }).strict();
export const roleChangeSchema = z.object({ userId: z.uuid(), role: z.enum(["participant", "reviewer", "admin"]), reason: z.string().trim().min(10).max(1000) }).strict();
export function safeAccountNext(value: string | null) {
  return value === "/account?flow=update-password" ? value : "/account?mode=live";
}
