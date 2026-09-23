# Live setup and verification

## Current verification boundary

On 23 September 2026 the user confirmed Supabase project `ifjiznbfragrjdnsozmq` is development only. The connected Supabase plugin applied migrations 007–013 in order; its migration history lists all seven. Postflight SQL confirmed the private location schema, administration table, quota function and reviewer mission function. Migration 012 removed unintended anonymous grants on app `SECURITY DEFINER` functions, and migration 013 fixed an ambiguous assessment-claim query found during live testing. The advisor still flags PostGIS's existing public installation and `spatial_ref_sys`; those are not part of this app's new tables.

Local automated coverage includes account role enforcement, strict profile fields, administrator actions, public geometry decoding, clustering, upload retries, assessment failure and escaped printable reports. Demo browser checks are documented separately in `frontend.md`.

On 23 September 2026, typecheck, 66 tests, lint and the production build passed. The account screen was visually checked on desktop and at 390 × 844, recovery-form switching was checked, and an anonymous administrator visit correctly showed the permission screen. Hosted fixture testing created four fixture accounts plus one confirmed browser-QA account, two synthetic incidents, four observations, one processed PNG, reviewer-requested missions, a reviewer outcome and administrator audit events. A second account completed a repeat mission with precise location quality and earned 10 impact points. A serious safety flag paused remaining missions, and subsequent responses were denied. Participant reviewer/admin and exact-location access were denied; reviewer exact-location access was audited. JSON/print exports excluded the fixture's exact coordinates. The separate administrator pause preserved evidence status. Missing AI produced persisted failed assessments while observations and media remained available.

The confirmed browser-QA account signed in through the real form. On desktop and at 390 × 844, the live explorer showed both persisted cases on a Leaflet map and in list mode, with approximate areas, statuses and separate safety warnings. The resolved investigation showed three observations in its evidence timeline and a clear unavailable-assessment state. After audited role changes, the same account saw the protected reviewer queue, location and assessment panels, then the administrator role and safety audit. Its role was restored to participant. A Next.js development overlay appeared because the installed Grammarly extension injected attributes into `<body>` before hydration; the product layout itself remained usable.

Successful AI assessment with a configured provider and deliverable-email confirmation/recovery remain unverified. The synthetic accounts use `example.test` addresses and cannot validate email delivery.

## Configure a disposable project

1. Use a confirmed non-production Supabase project. Apply the files in `supabase/migrations` in filename order using the project's SQL editor or existing migration deployment workflow. Apply only unapplied migrations to an existing project. Keep the deployment log; successful access to a table alone is not a migration audit. Migrations 007 and 008 are required privacy controls, not optional enhancements.
2. Set `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` and server-only `SUPABASE_SERVICE_ROLE_KEY` in `.env.local`. Never expose the service key through a `NEXT_PUBLIC_` variable.
3. Set the Supabase Auth site URL to the local app origin and allow its `/auth/callback` redirect. Signup confirmation and password recovery need working test email delivery. The fixture accounts below are confirmed by the service API and do **not** verify email delivery.
4. Set `GEMINI_API_KEY` and `GEMINI_MODEL` for real assessments, or leave the key blank to exercise failure handling. Missing AI must preserve observations and photos and record an unavailable assessment. Successful AI status changes still require separate verification with a configured provider.
5. Start the app with `pnpm dev`. Use `http://localhost:3000` unless the server prints a different port. Ensure `.env.local` and the app point to the same project.

The project's existing migration history was created through the connected Supabase plugin; no database password or `DATABASE_URL` was needed. For a different environment, inspect its migration history and apply only missing files through the normal migration deployment workflow.

The application refreshes session cookies in `src/proxy.ts`; privileged endpoints independently validate the authenticated user and database role. Public signup always produces a participant. Profile updates accept a display name only. Administrators change other accounts' roles through an audited session RPC; the first administrator needs trusted service provisioning.

## Repeatable fixture preparation

Run only after authorizing test writes to the selected project, from the repository root:

```powershell
$env:AQUARELAY_NONPRODUCTION_PROJECT_REF = 'YOUR_CONFIRMED_TEST_PROJECT_REF'
$env:AQUARELAY_TEST_ORIGIN = 'http://localhost:3000'
node --env-file=.env.local scripts/live-fixtures.mjs --allow-test-writes
```

The tool refuses a project mismatch or a non-local app origin. It creates reporter and verifier participants, a reviewer and an administrator, with randomly generated passwords. Credentials and IDs stay in the gitignored `.env.fixtures.local` JSON file; do not share, commit or serve it. These confirmed synthetic email accounts cannot receive recovery mail.

It submits one explicitly labelled TEST FIXTURE observation through the real app, uploads a synthetic labelled PNG, then signs in as the reviewer to request upstream/repeat missions through the real review endpoint. It does not invent an AI result. These are persisted `is_demo=false` test-environment records, separate from fictional Maya demo data. The starting test area is latitude `51.50023`, longitude `-0.12027`; public maps must only reveal its rounded area.

After fixture preparation, `scripts/verify-dev-flow.mjs` exercises all four accounts through the local app. It creates additional synthetic observations and review/admin records, so use the same explicit guard and project reference:

```powershell
$env:AQUARELAY_NONPRODUCTION_PROJECT_REF = 'YOUR_CONFIRMED_TEST_PROJECT_REF'
node --env-file=.env.local scripts/verify-dev-flow.mjs --allow-test-writes
```

Its checkpoints are saved in the same gitignored manifest and a rerun validates the persisted results without duplicating them.

Rerunning in the same checkout reuses the manifest, accounts and observation idempotency key. Completed image processing is skipped, and existing open/paused mission types are not duplicated. An interrupted signed upload can expire; stop and inspect that media record before creating a replacement. The script does not delete data or reset reviewed cases. For a fresh scenario use a fresh disposable project/checkout. Dispose of the test project when testing is finished, following the project's normal administration process.

## Required report-to-review acceptance run

Record the date, project reference, incident/observation IDs, viewport and results for each step. Never put passwords or exact participant coordinates in screenshots or shared logs.

1. Sign in as the reporter in `/account`. Check the account identity, role, display-name update and contribution link. Submit another observation with up to three photographs. Confirm all processed images persist after refresh; retry an interrupted upload and confirm the same observation and media IDs are reused.
2. Open `/explore?mode=live`. Check real persisted markers, pan/zoom, cluster selection, filters, map/list switching, attribution, tile failure and empty states. At mobile width, verify the incident panel and touch targets. No API failure may show demo records.
3. Sign out and sign in as the verifier. Search missions near the fixture area and complete the repeat-observation mission from a safe public viewpoint. Confirm a second author in the evidence timeline, a changed evidence revision and a persisted impact event. The upstream mission deliberately has no precise target, so its response can be retained as evidence but will not automatically count as a completed mission. Keep safe-access guidance visible.
4. Inspect the latest assessment. With a configured provider, verify cited evidence references and deterministic status rules. With AI unavailable, verify a failed assessment record and the saved observations/photos still visible. Current background assessment uses Next.js `after`; it is not a durable job queue. Manual reassessment is available through the authenticated assessment endpoint for a contributor/reviewer.
5. Submit a serious safety flag on the remaining open mission. Confirm mission pausing is persisted independently from evidence status, new mission responses are rejected, and no screen implies that water is safe.
6. As a participant, verify reviewer/admin pages and their API calls deny access. Attempting a role in a profile update must fail. Exact-location reads must deny participant access; public incident/map/export fields must not contain private exact-location records.
7. Sign in as the reviewer. Inspect gallery, assessment history, duplicates, contradictions and the timeline. Retrieve authorised exact location through the audited route. Record an explained/resolved outcome with reasoning. Reload and confirm the persisted outcome and mission closure. Download JSON and open the print-friendly report; check print preview at A4 and confirm exact coordinates are absent.
8. Sign in as administrator. Change another test account's role with a reason and check the audit record. Verify self-role changes are refused. Pause a separate open test incident and confirm the evidence status is preserved.
9. Independently test a real deliverable-email account through signup confirmation, signout/signin and password recovery. Repeat the citizen journey at a narrow mobile viewport and reviewer/admin workflows on desktop.

Run `pnpm typecheck`, `pnpm lint`, `pnpm test` and `pnpm build` after changes. Passing these checks or the fixture preparation script does not replace the acceptance run above.

Remaining operational dependencies: working mail delivery and a real AI key for the successful-assessment branch. Reviewers can request up to three approved mission types without AI; migration 011 records the review and missions atomically and rejects field missions during a safety pause. Automatic mission generation still depends on a successful assessment.
