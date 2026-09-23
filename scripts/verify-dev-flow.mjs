// Runs a synthetic, repeatable integration path against the explicitly named dev project.
import { createServerClient } from "@supabase/ssr";
import { readFile, writeFile } from "node:fs/promises";

const file = new URL("../.env.fixtures.local", import.meta.url);
const state = JSON.parse(await readFile(file, "utf8"));
const project = process.env.AQUARELAY_NONPRODUCTION_PROJECT_REF;
const origin = process.env.AQUARELAY_TEST_ORIGIN ?? "http://localhost:3000";
if (!process.argv.includes("--allow-test-writes") || !project || project !== state.project ||
    new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).hostname !== `${project}.supabase.co` ||
    !["localhost", "127.0.0.1"].includes(new URL(origin).hostname))
  throw new Error("Explicit matching development project, local origin, and --allow-test-writes required.");
const save = () => writeFile(file, JSON.stringify(state, null, 2), { mode: 0o600 });
async function session(role) {
  const cookies = new Map();
  const client = createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
    cookies: {
      getAll: () => [...cookies].map(([name, value]) => ({ name, value })),
      setAll: values => values.forEach(({ name, value }) => cookies.set(name, value)),
    },
  });
  const auth = await client.auth.signInWithPassword(state.accounts[role]);
  if (auth.error) throw new Error(`Sign in ${role}: ${auth.error.message}`);
  return { role, request: async (method, path, body, idempotencyKey) => {
    const response = await fetch(origin + path, {
      method,
      headers: {
        Cookie: [...cookies].map(([name, value]) => `${name}=${value}`).join("; "),
        ...(body ? { "Content-Type": "application/json" } : {}),
        ...(idempotencyKey ? { "Idempotency-Key": idempotencyKey } : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    const contentType = response.headers.get("content-type") ?? "";
    const result = contentType.includes("application/json") ? await response.json() : await response.text();
    return { status: response.status, result, contentType };
  }};
}
function assert(condition, message) { if (!condition) throw new Error(message); }
function ok(response, label) {
  assert(response.status >= 200 && response.status < 300, `${label}: HTTP ${response.status} ${response.result?.error?.code ?? ""}`);
  return response.result;
}
const id = state.incident.incidentId;
const reporter = await session("reporter");
const verifier = await session("verifier");
const reviewer = await session("reviewer");
const admin = await session("admin");
for (const who of [reporter, verifier, reviewer, admin]) {
  const me = ok(await who.request("GET", "/api/me"), `${who.role} account`);
  assert(me.user?.id === state.accounts[who.role].id, `${who.role}: wrong account`);
  console.log(`${who.role} account: authenticated`);
}
const original = ok(await verifier.request("GET", `/api/incidents/${id}`), "incident detail").incident;
assert(original.observations?.length >= 1 && original.assessments?.some(x => x.state === "failed"), "Saved photo/failed assessment not visible");
assert(JSON.stringify(original).includes("TEST FIXTURE"), "Fixture label missing");
console.log("incident detail: source evidence and unavailable assessment visible");
const participantReview = await verifier.request("POST", `/api/incidents/${id}/reviews`, { decision: "explained", explanation: "TEST: unauthorized" });
assert(participantReview.status === 403, "Participant could record review");
const participantAdmin = await verifier.request("GET", "/api/admin");
assert(participantAdmin.status === 403, "Participant could access administration");
console.log("participant review/admin denial: verified");
const missions = ok(await verifier.request("POST", "/api/missions", { latitude: 51.50023, longitude: -0.12027, radiusMeters: 5000 }), "mission list").missions;
const repeat = missions.find(x => x.type === "repeat_observation") ?? (state.verification?.repeat ? { id: state.verification.repeat.missionId } : null);
const upstream = missions.find(x => x.type === "upstream_comparison") ?? (state.verification?.safety ? { id: state.verification.safety.missionId } : null);
assert(repeat && upstream, "Reviewer-requested missions missing");
console.log("reviewer-requested missions: visible to verifier");
if (!state.verification?.repeat) {
  const now = new Date().toISOString();
  const result = ok(await verifier.request("POST", `/api/missions/${repeat.id}/responses`, {
    location: { latitude: 51.50023, longitude: -0.12027, source: "device", accuracyMeters: 20, capturedAt: now },
    observedAt: now,
    description: "TEST FIXTURE: synthetic later view from a public bridge; foam remains visible.",
    answers: { conditionVisible: true, persists: true, safeAccess: true },
    safetyFlags: [],
  }, `verify-repeat-${state.run}`), "repeat mission response");
  assert(result.observationId && result.evidenceRevision > 1, "Mission response did not persist");
  state.verification ??= {};
  state.verification.repeat = { missionId: repeat.id, observationId: result.observationId, evidenceRevision: result.evidenceRevision };
  await save();
  console.log(`repeat mission: ${result.locationQualityFlag ?? "in range"}, ${result.locationQuality}, impact ${result.impactPoints}`);
}
const afterRepeat = ok(await verifier.request("GET", `/api/incidents/${id}`), "post-repeat incident").incident;
assert(afterRepeat.observations?.some(x => x.id === state.verification.repeat.observationId), "Second author observation missing");
assert(afterRepeat.evidence_revision >= state.verification.repeat.evidenceRevision, "Evidence revision did not advance");
console.log("second author and evidence revision: persisted");
const participantLocation = await verifier.request("GET", `/api/observations/${state.incident.observationId}/location`);
assert(participantLocation.status === 403, "Participant could read exact location");
const reviewerLocation = ok(await reviewer.request("GET", `/api/observations/${state.incident.observationId}/location`), "reviewer location");
assert(reviewerLocation.locations?.length, "Reviewer exact location missing");
const audit = ok(await reviewer.request("GET", `/api/incidents/${id}/location-audit`), "location audit");
assert(audit.audit?.length, "Exact location read was not audited");
console.log("exact-location reviewer access and participant denial: verified with audit");
if (!state.verification.safety) {
  const now = new Date().toISOString();
  const result = ok(await verifier.request("POST", `/api/missions/${upstream.id}/responses`, {
    location: { latitude: 51.5013, longitude: -0.1211, source: "device", accuracyMeters: 25, capturedAt: now },
    observedAt: now,
    description: "TEST FIXTURE: synthetic odor report from a safe public viewpoint; no water contact.",
    answers: { conditionVisible: true, safeAccess: true },
    safetyFlags: ["strong_fumes"],
  }, `verify-safety-${state.run}`), "safety response");
  state.verification.safety = { missionId: upstream.id, observationId: result.observationId };
  await save();
}
const paused = ok(await verifier.request("GET", `/api/incidents/${id}`), "paused incident").incident;
assert(paused.safety_state === "missions_paused", "Serious safety flag did not pause missions");
const blocked = await verifier.request("POST", `/api/missions/${upstream.id}/responses`, {
  location: { latitude: 51.5013, longitude: -0.1211, source: "device", accuracyMeters: 25, capturedAt: new Date().toISOString() },
  observedAt: new Date().toISOString(), description: "TEST FIXTURE: should be blocked", answers: {}, safetyFlags: [],
}, `verify-blocked-${state.run}`);
assert(blocked.status >= 400, "Paused mission accepted a new response");
console.log("serious safety flag: persisted pause and response denial");
if (!state.verification.reviewed) {
  ok(await reviewer.request("POST", `/api/incidents/${id}/reviews`, {
    decision: "explained",
    explanation: "TEST FIXTURE: synthetic reports retained for demonstration; no environmental conclusion is claimed.",
  }), "reviewer outcome");
  state.verification.reviewed = true;
  await save();
}
const resolved = ok(await reviewer.request("GET", `/api/incidents/${id}`), "resolved incident").incident;
assert(resolved.evidence_status === "resolved_or_explained" && resolved.resolved_at, "Reviewer outcome did not persist");
const exportResult = ok(await reviewer.request("GET", `/api/incidents/${id}/export`), "reviewer JSON export");
assert(exportResult.incident?.observations?.length >= 3, "JSON export omitted evidence");
assert(!JSON.stringify(exportResult).includes("51.50023"), "Export disclosed the fixture exact latitude");
const report = await reviewer.request("GET", `/api/incidents/${id}/report`);
assert(report.status === 200 && report.contentType.includes("text/html") &&
  report.result.includes("Source evidence timeline") && !report.result.includes("51.50023"), "Printable report invalid or discloses exact location");
console.log("reviewer outcome, JSON export, and printable report: verified");
const adminView = ok(await admin.request("GET", "/api/admin"), "admin workspace");
assert(adminView.profiles?.length >= 4 && adminView.audit, "Admin workspace missing accounts/audit");
const selfRole = await admin.request("POST", "/api/admin", { action: "role", userId: state.accounts.admin.id, role: "participant", reason: "TEST FIXTURE: self role denial" });
assert(selfRole.status === 400, "Administrator could change own role");
if (!state.verification.adminRole) {
  ok(await admin.request("POST", "/api/admin", { action: "role", userId: state.accounts.verifier.id, role: "reviewer", reason: "TEST FIXTURE: verify audited role promotion" }), "role promotion");
  ok(await admin.request("POST", "/api/admin", { action: "role", userId: state.accounts.verifier.id, role: "participant", reason: "TEST FIXTURE: restore verifier role" }), "role restoration");
  state.verification.adminRole = true;
  await save();
}
const updatedAdmin = ok(await admin.request("GET", "/api/admin"), "admin audit after change");
assert(updatedAdmin.audit?.filter(x => x.action === "role_changed" && x.target_user_id === state.accounts.verifier.id).length >= 2, "Role audit missing");
console.log("administrator role changes, audit, and self-change denial: verified");
if (!state.verification.adminPauseIncident) {
  const now = new Date().toISOString();
  const second = ok(await reporter.request("POST", "/api/observations", {
    category: "foam",
    locationLabel: "TEST DATA — separate fixture reach",
    location: { latitude: 51.5071, longitude: -0.1271, source: "map", accuracyMeters: null, capturedAt: now },
    observedAt: now,
    description: "TEST FIXTURE: separate synthetic incident for administrator pause verification.",
    answers: { conditionVisible: true, safeAccess: true }, safetyFlags: [],
  }, `verify-admin-pause-${state.run}`), "second incident");
  state.verification.adminPauseIncident = second.incidentId;
  await save();
}
const pauseId = state.verification.adminPauseIncident;
const beforePause = ok(await admin.request("GET", `/api/incidents/${pauseId}`), "admin pause target").incident;
if (beforePause.safety_state !== "missions_paused")
  ok(await admin.request("POST", "/api/admin", {
    action: "pause", incidentId: pauseId, reason: "TEST FIXTURE: administrator safety pause for isolated synthetic case",
  }), "administrator pause");
const afterPause = ok(await admin.request("GET", `/api/incidents/${pauseId}`), "admin paused target").incident;
assert(afterPause.safety_state === "missions_paused", "Administrator pause did not persist");
assert(afterPause.evidence_status === beforePause.evidence_status, "Administrator pause changed evidence status");
const finalAdmin = ok(await admin.request("GET", "/api/admin"), "admin audit after pause");
assert(finalAdmin.audit?.some(x => x.incident_id === pauseId && x.action === "missions_paused"), "Administrator pause audit missing");
console.log("administrator pause: persisted independently of evidence status and audited");
