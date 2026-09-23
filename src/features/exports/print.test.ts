import { expect,it } from "vitest";
import { renderIncidentReport } from "./print";
it("escapes evidence text and excludes private location fields from printable reports",()=>{
  const report=renderIncidentReport({id:"case",category:"foam",evidence_status:"needs_verification",safety_state:"missions_paused",updated_at:"2026-09-23",observations:[{id:"obs",observed_at:"2026-09-23",description:'<script>alert("x")</script>',is_potential_duplicate:true,safety_flags:["strong_fumes"]}]});
  expect(report).not.toContain('<script>');expect(report).toContain('&lt;script&gt;');expect(report).toContain('no independent support');expect(report).toContain('missions paused');expect(report).toContain('No completed AI assessment');expect(report).toContain('Exact participant coordinates are excluded');
});
