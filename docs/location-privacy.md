# Backend location privacy

## Storage and access

Migrations `202609230007_location_privacy.sql` and
`202609230008_location_intelligence.sql` move historical exact incident,
observation and mission points to the `private` schema. Public geography columns
retain their names but now hold deterministic 0.01-degree cell centres (about
1.1 km north/south; east/west width varies by latitude). They are approximate
areas, not navigable destinations or measured accuracy circles. Repeated reads
do not generate new random points that could be averaged to recover a location.

BEFORE triggers capture future points before public row insertion, so exact
points never enter public table RETURNING values or new public realtime records.
The migration is transactional. Exact values remain usable by PostGIS in the
restricted tables; application-layer encryption would prevent these queries.
Infrastructure must protect database storage, backups, transport and privileged
credentials. Do not add private tables to replication publications or expose the
private schema in the Data API.

Only audited functions expose exact points to reporters for their own
observations, reviewers/admins and trusted server operations. Direct table
SELECT grants are revoked from participants and reviewers. Mission exact targets
remain server-side. Participants cannot write these tables or bypass submission
RPCs by inserting public records directly. `get_observation_location(uuid)`
checks reporter/reviewer authorization and the retention window, records access,
then returns the exact point and metadata. An unrelated user receives no rows.
The service role also lacks direct private-table SELECT grants; it uses audited
functions for exact access, matching and mission search. General incident
APIs, mission responses and exports always use public approximate values, even
when executed by a reviewer or service client.

## Input contract

Both observation and mission-response bodies require:

```json
{
  "location": {
    "latitude": 51.501234,
    "longitude": -0.123456,
    "source": "device",
    "accuracyMeters": 12,
    "capturedAt": "2026-09-23T10:00:00Z"
  }
}
```

`source` is `device`, `map`, or `search`. Device fixes require finite accuracy
between 0 and 10,000 metres. Map/search inputs may use `null` when accuracy is
unknown; this is not treated as zero. Coordinates must be finite and within
geographic bounds. SQL repeats the validation for callers bypassing HTTP.
`capturedAt` is the time of the coordinate fix or map selection, separate from
`observedAt` and submission time. It must be no more than five minutes in the
future or 30 days old. A device fix over one hour from the claimed observation
time raises a review signal. Historical fixes use `legacy_unknown`, null accuracy
and null capture time instead of invented metadata. Exact metadata and target
distances stay in private storage.

Survey `answers` accepts only optional boolean `conditionVisible`, `persists`,
and `safeAccess` fields. Unknown/nested answer fields are rejected at HTTP and
stripped by SQL. Labels are kept privately for newly created incidents and
excluded from public output. Conservative text filtering removes decimal
numbers, coordinate pairs and URLs from public descriptions, reviews, mission
instructions and assessment text. This can remove benign numeric details too.
Free-form text and photographs can still describe a recognizable place; these
filters are not a guarantee against a person deliberately encoding a location
in prose or visible image content.

## Matching and mission quality

- Live observations never match demo incidents. Live responses to demo missions
  are rejected.
- Matching requires the same stream ID, category, unresolved incident, age within
  24 hours and exact PostGIS distance within 250 metres. An unambiguous curated
  stream within 75 metres can supply a missing ID; other unknown streams never
  auto-merge. A reported stream more than 150 metres from its geometry is flagged
  and not used for matching. Matching is serialized per stream/category.
- Nearby mission selection uses private exact targets, falling back to the
  private incident anchor. Search centres snap to public grid cells and radii
  expand in kilometre steps. Exact distances stay inside PostGIS; output points
  are coarse.
- A response outside its mission's configurable 50–2,000 metre target radius
  receives `far_from_target`.
  For repeat/photo/safe-viewpoint missions, the incident anchor may be used when
  no target is set. Directional comparison missions without a target receive
  `target_unknown`; the incident point is not presumed to be an upstream target.
- Flagged, manually selected or low accuracy responses remain evidence, but do
  not complete missions, earn spatial points or count as precise corroboration.
  Serious safety flags still pause missions. Replays do not award points twice.
- The database assigns `precise`, `approximate`, `low_accuracy`,
  `manually_selected` or `location_conflict`. It also stores non-coordinate facts:
  distance band from the origin, same/different stream, upstream/downstream when
  the curated line's flow direction is verified, and inside/outside target radius.
  Assessment and reviewer views receive these facts, never exact points.
- Review conflicts include a reported stream far from the point, a label naming
  another known stream or containing a conflicting coordinate pair, a device fix
  captured far from observation time, a response outside the target radius, and
  an identical point submitted by at least three distinct accounts in seven
  days. Arbitrary place names require a geocoder or human review; the backend
  does not claim to validate them automatically.

## Boundaries and logging

Use `POST /api/missions` with a JSON body for nearby queries. Both coordinates
are required; radius is 1–5 km and response size is at most 25. GET returns 405.
The request centre snaps to a stable cell and the search radius rounds up in
kilometre steps, limiting coordinate inference from repeated search probes.
The backend authenticates and checks a database quota before using the
service-only spatial RPC. Ordinary incident lists are capped at 20 rows per
page and 100 rows of offset; direct Supabase table reads are revoked so callers
cannot skip those controls. Ordinary case lists and details expose only
generalized locations and do not spend the exact-location quota. Database
quotas still limit exact-location access and proximity searches, including
mission searches and possible-case matching. Request bodies, database
errors and validation input values are not logged. Next development access logs
are disabled to prevent accidental coordinate URLs entering console output.
Production reverse proxies/APM/database audit tooling must likewise omit bodies,
query strings and SQL bind values; application code cannot rewrite their logs.

AI input is built with an explicit field allowlist, sanitized descriptions and
boolean survey answers. It includes only quality classes and relative spatial
facts, with no exact coordinates, author IDs, labels, numeric accuracy or exact
distances. Photos are re-encoded without metadata during upload
and again for AI. Exports use approximate public rows and only ready photo URLs.
Previously generated exports, logs, backups and previously downloaded images are
not retroactively erased by this migration.

## Retention and reviewer operations

Exact points and private labels remain while an incident is active and for 90
days after resolution. An administrator can record a dated, justified hold for
legal or consented research needs. Outside the window, the exact-location RPC
immediately stops returning points; the scheduled purge clears exact incident,
observation and mission points and private labels while keeping approximate
historical rows. Run `supabase/ops/schedule-location-retention.sql` once after
enabling pg_cron on the hosted database. Monitor that daily job; without it,
physical deletion is delayed even though exact API access expires.

`GET /api/incidents/{id}/location-audit` is reviewer-only and shows exact
access, correction, removal and hold events without returning coordinates.
`POST /api/observations/{id}/location-corrections` lets a reviewer provide a
corrected point, source, accuracy, capture time and reason. It updates relative
facts for the incident and records the correction. `POST
/api/incidents/{id}/location-retention` is administrator-only and requires a
future hold date plus justification. Matching and nearby mission searches also
record audited access with the requesting account ID.

## Rollout and tests

Apply migrations 007 and 008 in order before deploying the updated backend, in a maintenance
window: old submission RPC signatures are removed deliberately so no unvalidated
overload remains. The new location metadata contract requires a future client
update; this change does not modify frontend code.

Run `pnpm test`, `pnpm typecheck`, `pnpm lint` and `pnpm build`. For SQL integration
tests, use a disposable PostGIS database. `supabase/tests/bootstrap-local.sql`
provides minimal auth/storage stand-ins for a fresh local PostgreSQL instance;
do not run that bootstrap on Supabase. Apply migrations through 007, then run
`location-privacy.sql`; apply 008 and run `location-intelligence.sql`. Both test
files use real roles, RLS, RPCs and PostGIS distances, and roll their fixtures back.

To test the upgrade of existing data, load `location-backfill-before.sql` after
migration 006, apply migration 007, then run `location-backfill-after.sql` and
`location-privacy.sql`. Apply migration 008 and run `location-intelligence.sql`.
These fixtures belong only in the disposable database.
