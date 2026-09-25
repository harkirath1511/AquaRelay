# AquaRelay

**One person notices. The community verifies. Experts can act.**

AquaRelay is a community evidence platform for suspicious changes around urban
waterways and shared environments. People can report what they see, safely
contribute follow-up observations, and understand how the evidence changes over
time. Reviewers can inspect the complete evidence trail before recording an
outcome.

It is designed to support careful investigation, not to diagnose pollution,
declare water safe, or replace professional environmental assessment.

## What it does

- Guides people through reporting foam, discolouration, litter, erosion,
  habitat damage, air-quality concerns, and other environmental observations.
- Groups only compatible live observations into an investigation, while keeping
  unrelated nearby reports separate.
- Uses structured AI assessment to describe visible evidence, uncertainty and
  the next useful piece of evidence. It does not make environmental diagnoses.
- Creates safe verification missions such as a clearer photo or a repeat
  observation from a public viewpoint.
- Shows investigations, evidence timelines, participant impact and a reviewer
  workspace.
- Includes a clearly labelled demo mode for a full, no-write walkthrough.

## Experience

The interface uses a responsive living-atlas design: an interactive WebGL globe,
original isometric environmental illustrations, motion controls, keyboard-ready
evidence journey, and light/dark themes. It honours reduced-motion preferences.

| Route | Purpose |
| --- | --- |
| `/` | Landing page and interactive evidence journey |
| `/explore` | Map and list of investigations |
| `/report` | Guided observation or mission-response flow |
| `/investigations/:id` | Evidence, assessment and timeline detail |
| `/missions` | Available verification missions |
| `/impact` | A participant's contribution history |
| `/review` | Reviewer queue and case decisions |
| `/account` | Supabase sign-in and account details |

Live mode is the default. Add `?mode=demo` to any experience to view the
fictional walkthrough without authentication or database writes. Demo records,
imagery and decisions are explicitly identified in the UI.

## Location privacy and safety

Exact coordinates are treated as protected evidence:

- Exact observation and mission coordinates live in the restricted Postgres
  `private` schema. Reporters may access their own locations; reviewers and
  trusted server operations access them through audited database functions.
- Ordinary maps, APIs and exports receive a stable approximate grid-cell centre,
  never a randomized or precise coordinate.
- Exact locations are used internally for matching, nearby mission selection and
  distance calculations, but are excluded from AI requests, logs, public APIs
  and exports.
- Location metadata records source (`device`, `map` or `search`), accuracy and
  capture time. Responses far from a mission target are flagged.
- Serious safety reports pause community missions and route the case for review.

Read the full [location privacy design](./docs/location-privacy.md) before
deploying or operating the backend.

## Stack

- Next.js 16 App Router, React 19 and TypeScript
- Supabase Auth, PostgreSQL, PostGIS, Storage and Row Level Security
- Zod validation and Next.js Route Handlers
- Groq structured-output adapter for server-side assessments
- Leaflet/OpenStreetMap for the live investigation map
- Vitest for automated tests

## Run locally

### Prerequisites

- Node.js compatible with Next.js 16
- pnpm 10+
- A Supabase project for live mode

```bash
pnpm install
Copy-Item .env.example .env.local
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000). The demo experience works
without Supabase configuration; live data and sign-in require the environment
variables below.

```dotenv
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
GROQ_API_KEY=
GROQ_MODEL=qwen/qwen3.8-27b
```

Keep `SUPABASE_SERVICE_ROLE_KEY` and `GROQ_API_KEY` server-only. Do not expose
them in browser code or commit `.env.local`.

## Configure Supabase

1. Create a Supabase project with PostGIS available.
2. Apply every file in [`supabase/migrations`](./supabase/migrations) in
   filename order.
3. Add the values above to `.env.local` or to your deployment environment.
4. Create participant accounts through Supabase Auth. Assign reviewer roles by
   updating `profiles.role` through a trusted service-role or admin operation.
5. Enable the retention job in
   [`supabase/ops/schedule-location-retention.sql`](./supabase/ops/schedule-location-retention.sql)
   after enabling `pg_cron` in the hosted database.

For disposable local SQL integration testing, start with
[`supabase/tests/bootstrap-local.sql`](./supabase/tests/bootstrap-local.sql).
Never run that bootstrap against a hosted Supabase project.

## API overview

All live endpoints use Supabase session authentication where needed. Observation
and mission-response submissions require an `Idempotency-Key` header (8–200
characters), allowing safe retries.

| Area | Endpoints |
| --- | --- |
| Health | `GET /api/health` |
| Investigations | `GET /api/incidents`, `GET /api/incidents/:id`, `POST /api/incidents/matches`, `POST /api/incidents/:id/assess`, `POST /api/incidents/:id/reassess` |
| Observations | `POST /api/observations`, `POST /api/observations/:id/invalidate`, `GET /api/observations/:id/location`, `POST /api/observations/:id/location-corrections` |
| Missions | `POST /api/missions`, `GET /api/missions/:id`, `POST /api/missions/:id/responses`, `POST /api/incidents/:id/comparison-missions` |
| Media | `POST /api/uploads`, `POST /api/uploads/:id/complete` |
| Review and export | `GET /api/reviews`, `POST /api/incidents/:id/reviews`, `GET /api/incidents/:id/export`, `GET /api/incidents/:id/report` |
| Account and administration | `GET/PATCH /api/me`, `GET /api/me/impact`, `GET/POST /api/admin` |

Nearby mission discovery intentionally uses `POST /api/missions`, rather than
coordinates in a URL. Public API responses remain approximate even for reviewers.

## Verify changes

```bash
pnpm typecheck
pnpm lint
pnpm test
pnpm build
```

The repository also contains SQL privacy, retention and location-intelligence
tests under [`supabase/tests`](./supabase/tests). Run them only against a
disposable PostGIS database following the instructions in the location privacy
guide.

## Project docs

- [Product and technical plan](./PLAN.md)
- [Frontend modes and presentation guide](./docs/frontend.md)
- [Location privacy, retention and operational guidance](./docs/location-privacy.md)
- [Live setup and verification notes](./docs/live-verification.md)

## Boundaries before a public pilot

AquaRelay is a hackathon-stage project. A real public deployment needs reviewed
safety language, environmental partners, moderation and abuse processes,
observability, backup/retention operations, and a verified stream/access
dataset. The product must never incentivise people to enter water, trespass,
approach unknown substances or put themselves at risk.
