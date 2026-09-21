# AquaRelay — End-to-End Project Plan

**Track:** Track 3 — AI-Supported Assessment  
**Tagline:** One person notices. The community verifies. Experts can act.

## Product summary

AquaRelay is a community-powered system for investigating suspicious changes in urban streams. A citizen reports foam, discoloured water, litter, odours, wildlife distress, or another concern. AquaRelay explains what the submitted evidence supports, identifies missing information, and creates small, safe verification missions for nearby participants. Independent upstream, downstream, and repeat observations become a transparent evidence timeline that researchers or local authorities can review.

The product does not diagnose pollution or replace professional testing. Its core innovation is adaptive community verification: selecting the next observation that will most reduce uncertainty and explaining how every contribution changes the evidence picture.

## Users and end-to-end experience

- **Citizens** submit quick, guided observations and receive updates.
- **Community verifiers** discover safe missions and contribute comparisons.
- **Researchers and reviewers** inspect source evidence, contradictions, and timelines before recording outcomes.
- **Community organisations** coordinate participation and use completed investigations for education.

The main flow is:

1. A participant submits a geolocated observation, description, structured answers, and optional photographs.
2. The system checks completeness, duplicate signals, and urgent safety flags.
3. AI produces a structured, evidence-linked assessment that describes uncertainty and missing evidence.
4. Deterministic rules create approved verification missions such as an upstream comparison or repeat observation.
5. Other participants complete missions; every response is preserved even when it contradicts the original report.
6. The evidence status and investigation timeline update transparently.
7. A reviewer requests more evidence, recommends expert review, or records a resolved/explained outcome.
8. AquaRelay produces a concise, printable incident summary and JSON export.

Evidence status is separate from safety and review workflow:

- `early_signal`
- `needs_verification`
- `community_supported_concern`
- `expert_review_recommended`
- `resolved_or_explained`

Every status is accompanied by plain-language reasons. The interface does not present an uncalibrated confidence percentage.

## MVP scope

The hackathon MVP supports live reporting and assessment alongside a clearly labelled seeded demonstration. Detailed guided questions and mission templates initially cover foam, discolouration, and litter; other categories use general prompts and reviewer triage.

Core capabilities:

- Authenticated observation submission with location, time, category, structured answers, and up to three images.
- Investigation matching for nearby, recent reports of the same category.
- Private media storage, metadata removal, signed access, and upload validation.
- Structured AI assessment with schema validation, source references, failure recovery, and assessment versioning.
- Approved mission catalogue: upstream, downstream, repeat, clearer photo, unaffected comparison, safe-viewpoint observation, and unsafe-access report.
- Map/list discovery, mission responses, evidence history, and safety pauses.
- Reviewer queue, reviewer outcomes, audit trail, print-friendly report, and JSON export.
- Evidence Impact Score that recognises useful uncertainty reduction without affecting evidence credibility.

The MVP excludes automated pollution diagnosis, professional sampling, competitive leaderboards, automatic authority contact, predictive alerts, and claims of a live OneAquaHealth integration.

## Technical architecture

### Stack

- Next.js App Router and React with TypeScript strict mode.
- Next.js Route Handlers as the backend-for-frontend API.
- Zod for request, domain, environment, and AI-output validation.
- Supabase PostgreSQL with PostGIS, Auth, private Storage, and row-level security.
- A server-only AI assessment adapter, initially configured for Gemini structured output.
- Vitest for domain and API tests; Playwright for critical end-to-end flows.
- Vercel for the web application and Supabase for managed data services.

The domain layer remains independent of React and provider SDKs. Route handlers validate HTTP input and invoke domain services. Infrastructure adapters implement persistence, storage, identity, and AI interfaces, allowing deterministic in-memory adapters in tests and demos.

### Core data model

- `profiles`: user identity, display name, and protected application role.
- `streams`: named waterways and optional curated geometry/flow metadata.
- `incidents`: investigation location, category, evidence status, safety state, and resolution.
- `observations`: author, observed/submitted times, structured answers, location, and optional mission link.
- `media`: private object reference, file hash, ownership, and processing state.
- `assessments`: evidence revision, structured findings, model metadata, and referenced sources.
- `missions`: approved type, evidence gap, target area, instructions, safety text, and state.
- `reviews`: reviewer decision, explanation, and requested follow-up.
- `impact_events`: append-only recognition awards and reversals.
- `incident_events`: append-only investigation timeline.

Store observation time separately from submission time. Preserve source evidence and superseded assessments. Treat distinct accounts only as an imperfect proxy for independent participants.

### API surface

- `POST /api/uploads` — validate upload intent and issue a restricted upload URL.
- `POST /api/observations` — submit an observation and match or create an investigation.
- `GET /api/incidents` — authorised, filtered investigation list/map data.
- `GET /api/incidents/:id` — investigation details, evidence, and timeline.
- `POST /api/incidents/:id/assess` — assess the current evidence revision.
- `GET /api/missions` — available missions by area and type.
- `POST /api/missions/:id/responses` — complete a mission and trigger reassessment.
- `POST /api/incidents/:id/reviews` — record an authorised reviewer decision.
- `GET /api/incidents/:id/export` — authorised structured incident export.

Submission endpoints accept idempotency keys. Shared Zod schemas define request and response contracts. Both server authorisation and database row-level security enforce access.

### Evidence and safety rules

AI may describe visible features with uncertainty, identify missing information and contradictions, suggest mission types from the approved catalogue, and draft an evidence-linked summary. It must not identify a pollutant, assert a source, declare water safe, approve hazardous missions, or close a case.

Deterministic application rules control workflow status:

- A submitted observation begins as an early signal.
- An assessed case with material gaps needs verification.
- Relevant, nonduplicate corroboration from two distinct accounts can support a community concern.
- Spatial comparison plus persistence evidence can recommend expert review.
- Serious safety flags immediately route to review and pause community missions.
- Material contradictions remain prominent and prevent ordinary automatic escalation.
- Only an authorised reviewer resolves or explains a case.

Every mission prohibits entering water, touching unknown substances, approaching distressed wildlife, trespassing, or confronting suspected polluters. Reports of strong fumes, chemical containers, mass wildlife death, flooding, or rapidly changing water conditions halt community verification.

## Delivery phases

1. **Foundation:** initialize Next.js/TypeScript, environment validation, testing, Supabase clients, migrations, authentication, roles, and RLS.
2. **Observation intake:** implement validated submission, private media intents, idempotency, matching, and incident creation.
3. **Assessment:** implement the provider-neutral AI adapter, structured output, evidence rules, versioning, and safe retries.
4. **Community verification:** implement mission generation, discovery, responses, reassessment, safety pauses, and impact events.
5. **Expert workflow:** implement review queue, decisions, evidence timeline, participant outcomes, and exports.
6. **Demo and hardening:** seed the Maya foam investigation, add a contradictory-evidence scenario, verify security/accessibility, and deploy.

Commit at meaningful checkpoints: application foundation, persistence/authentication, observation intake, assessment engine, missions, and reviewer/export workflow.

## Testing and acceptance

Automated coverage includes evidence state transitions, contradictions, duplicate handling, mission eligibility, safety pauses, idempotency, recognition awards, access policies, malformed AI output, timeouts, stale assessment protection, private-media access, and the full report-to-review flow.

The MVP is accepted when:

- One participant can submit a real observation and never loses it if AI processing fails.
- Another account can contribute verification evidence through a safe mission.
- The investigation explains how supporting and contradictory evidence affects its status.
- Duplicates do not increase independent-evidence counts or recognition.
- Safety flags stop missions and route the incident to review.
- A reviewer can inspect original evidence, record an outcome, and produce an evidence-linked export.
- The seeded Maya scenario can be reset and demonstrated without being confused with live records.

## Production roadmap

Before a real public pilot, partner with an environmental organisation, validate rules and safety language with domain experts, define moderation and data-retention processes, configure local authority guidance, and add durable background jobs, monitoring, backups, abuse controls, and reviewed stream/access datasets.

Later releases can add multilingual reporting, opt-in notifications, more cities and incident templates, historical stream views, stronger duplicate analysis, and documented integrations with OneAquaHealth or local environmental systems.
