# AquaRelay frontend

## Run and modes

Run `pnpm dev` and open `http://localhost:3000`. The landing page and all seven experiences work in demonstration mode without authentication. Demo observations, geography, images and decisions are visibly labelled; demo submissions do not upload files or write backend records. Reviewer demo decisions last only for the current mounted session.

Use **Switch to live data** to connect to the existing APIs. `/account` signs in using Supabase email/password authentication and session cookies. Provision participant and reviewer accounts through your existing Supabase administration process. Apply the repository migrations and configure `.env.local` as described in the README. Never expose the service-role key to the browser.

Routes: `/`, `/explore`, `/report`, `/investigations/:id`, `/missions`, `/impact`, `/review`, `/account`. Live routes use `?mode=live`. Mission responses use `/report?mission=:id&mode=live`.

## Four-minute presentation

1. **0:00–0:35 — Landing.** Explain “One person notices. The community verifies. Experts can act.” Show the observation-to-action journey.
2. **0:35–1:10 — Explorer.** Open the foam investigation from its approximate map area. Try a category or distance filter and reset it. Explain that demonstration distances are relative to a fictional centre.
3. **1:10–2:30 — Investigation.** Read the evidence summary, known facts and remaining uncertainty. Open the timeline: Maya’s original report, clear upstream comparison, downstream confirmation, one-hour repeat, smell safety flag and duplicate. The repeat establishes persistence, the independent downstream contribution adds support, and the duplicate adds no independent support. Safety pauses field verification separately from evidence status.
4. **2:30–3:10 — Missions and impact.** Show an actionable mission and the paused foam mission. Show how Maya’s contributions reduced uncertainty without leaderboards or volume rewards.
5. **3:10–4:00 — Reviewer workspace.** Inspect the evidence gallery and assessment history. Record a demo decision with reasoning, inspect the fictional authorised-location example and export the JSON report. A reviewer outcome is not a statement that water is safe.

The five-step report flow can replace the missions segment when demonstrating a citizen journey. Use **Use current time**, complete the safety confirmation and finish the demo submission.

## API integration and boundaries

- Incident listing/detail, bounded POST mission search, participant impact and reviewer queue use the existing session-authenticated endpoints.
- Observation and mission submissions retain an idempotency key for retries. Upload retries retain their media intent and completed-upload checkpoint. Photos follow intent → signed upload → image finalization.
- Incident detail provides short-lived links only for processed media, without exposing storage object paths. Live reviewer galleries use the existing reviewer export endpoint.
- Public maps use only public approximate geometry. GeoJSON and PostGIS EWKB points are supported. Unavailable geometry is not plotted as an invented location.
- Exact observation locations use a reviewer-only route calling the existing session-scoped, audited, retention-aware database RPC. Its responses disable caching.
- All five evidence statuses have named badges, distinct symbols and explanations. Safety review and paused-mission states remain separate.
- Loading, empty, permission-denied, API failure, assessment failure and submission success views are implemented. Map-tile failure leaves the evidence list available.
- Live imagery expires after 15 minutes; refreshing the investigation renews its links. The stock landing photograph, Google Fonts and live OpenStreetMap tiles require network access. The fictional demo map and generated foam image are local assets.

## Validation

Automated tests cover the existing backend plus authorised location access, retention-empty responses, geometry decoding, permission errors and upload-finalization retry reuse. Run `pnpm typecheck`, `pnpm lint`, `pnpm test` and `pnpm build`.

Browser checks exercised the landing and explorer, combined filters and reset, investigation timeline/map tabs, all five demo submission steps including validation and success, and demo reviewer decision/history/location views. Desktop and narrow mobile layouts were visually inspected. No production records were created during these checks. Live writes require a configured, authorised account and are not represented as end-to-end production validation.

## Image provenance

The hero photograph is served from Unsplash (`photo-1437482078695-73f5ca6c96e2`). The foam image is a built-in ImageGen output saved at `public/images/demo-foam.png`, always identified as generated demo imagery. It is not a real observation.

Final generation prompt:

> Use case: photorealistic-natural. Asset type: simulated observation photograph in a fictional environmental investigation demo. Create a realistic smartphone photograph looking down from a safe public footbridge onto a small urban stream. White irregular patches of foam gather gently at the shallow stream edge beside dark wet stones and green riparian plants; muted natural overcast morning lighting, ordinary documentary appearance, river blue and forest green. A little of the footbridge structure visible at the upper edge for context. No people, no dead wildlife, no factory, no chemical containers, no diagnosis implied. Landscape 3:2 composition, detailed water and bubbles, focus on the foam patches. No text, no branding, no collage, no UI. This will be explicitly labelled generated demo imagery in the application.
