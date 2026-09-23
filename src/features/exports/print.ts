export function escapeHtml(value: unknown) {
  return String(value ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ]!,
  );
}
type PrintIncident = {
  id: string;
  category: string;
  evidence_status: string;
  safety_state: string;
  updated_at: string;
  status_reasons?: string[];
  observations?: {
    id: string;
    observed_at: string;
    description: string;
    is_potential_duplicate?: boolean;
    safety_flags?: string[];
  }[];
  assessments?: {
    state: string;
    result?: {
      summary?: { text: string; evidenceReferences?: string[] };
      missingEvidence?: string[];
      contradictions?: { text: string }[];
    };
  }[];
  reviews?: { decision: string; explanation: string; created_at: string }[];
};
export function renderIncidentReport(incident: PrintIncident) {
  const e = escapeHtml,
    label = (s: string) => e(s.replaceAll("_", " "));
  const assessment = incident.assessments
    ?.filter((a) => a.state === "complete")
    .at(-1)?.result;
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>AquaRelay report ${e(incident.id)}</title><style>body{font:14px/1.6 system-ui,sans-serif;color:#183c3a;max-width:850px;margin:40px auto;padding:0 24px}h1{font-size:28px}h2{font-size:19px;margin-top:28px}h3{font-size:15px}article{border-top:1px solid #ccd8ce;padding:14px 0;break-inside:avoid}small{color:#4e6258}.warning{border:1px solid #cbb993;padding:14px;background:#fff8e9}.metadata{display:grid;grid-template-columns:1fr 1fr;gap:10px}li{margin:6px 0}@media print{body{margin:0;max-width:none;font-size:11pt}.screen-only{display:none}@page{margin:18mm}} </style></head><body><p class="screen-only">Use your browser’s Print command to print or save this report as a PDF.</p><header><p>AQUARELAY · EVIDENCE REPORT</p><h1>${label(incident.category)} investigation</h1><p>Record ${e(incident.id)} · Updated ${e(incident.updated_at)}</p></header><div class="metadata"><div><strong>Evidence status</strong><p>${label(incident.evidence_status)}</p></div><div><strong>Safety state</strong><p>${label(incident.safety_state)}</p></div></div><p class="warning">Community evidence for expert review. This report is not a pollution diagnosis or a determination that water is safe. Exact participant coordinates are excluded.</p><h2>Assessment and uncertainty</h2><p>${e(assessment?.summary?.text ?? "No completed AI assessment is available. The source observations remain preserved for human review.")}</p>${assessment?.summary?.evidenceReferences?.length ? `<small>Source observation IDs: ${assessment.summary.evidenceReferences.map(e).join(", ")}</small>` : ""}<ul>${(assessment?.missingEvidence ?? []).map((t) => `<li>${e(t)}</li>`).join("")}</ul>${(assessment?.contradictions ?? []).map((t) => `<p><strong>Contradiction / limitation:</strong> ${e(t.text)}</p>`).join("")}<h2>Source evidence timeline</h2>${[
    ...(incident.observations ?? []),
  ]
    .sort((a, b) => Date.parse(a.observed_at) - Date.parse(b.observed_at))
    .map(
      (o) =>
        `<article><h3>${e(o.observed_at)}${o.is_potential_duplicate ? " · Potential duplicate — no independent support" : ""}</h3><p>${e(o.description)}</p>${o.safety_flags?.length ? `<p><strong>Safety flags:</strong> ${o.safety_flags.map(label).join(", ")}</p>` : ""}<small>Observation ${e(o.id)}</small></article>`,
    )
    .join(
      "",
    )}<h2>Reviewer decisions</h2>${(incident.reviews ?? []).map((r) => `<article><h3>${label(r.decision)} · ${e(r.created_at)}</h3><p>${e(r.explanation)}</p></article>`).join("") || "<p>No reviewer outcome recorded.</p>"}<footer><p>Generated ${e(new Date().toISOString())}. Read together with the full evidence record and JSON export.</p></footer></body></html>`;
}
