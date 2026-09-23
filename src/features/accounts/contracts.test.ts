import { expect,it } from "vitest";
import { profileUpdateSchema,safeAccountNext,roleChangeSchema } from "./contracts";
it("rejects role elevation through profile edits",()=>{expect(profileUpdateSchema.safeParse({displayName:"Maya",role:"admin"}).success).toBe(false);});
it("rejects open callback redirects",()=>{for(const path of ["https://evil.test","//evil.test","/admin","/\\evil.test"])expect(safeAccountNext(path)).toBe("/account?mode=live");expect(safeAccountNext("/account?flow=update-password")).toBe("/account?flow=update-password");});
it("requires a meaningful audited reason for role changes",()=>{expect(roleChangeSchema.safeParse({userId:"11111111-1111-4111-8111-111111111111",role:"reviewer",reason:"ok"}).success).toBe(false);});
