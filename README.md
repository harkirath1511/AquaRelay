# AquaRelay

AquaRelay turns uncertain citizen observations about urban streams into structured, reviewable evidence. The backend is built with Next.js and TypeScript.

See [PLAN.md](./PLAN.md) for the product and technical plan.

The frontend includes a photographic landing page, investigation explorer, guided reporting, evidence timeline, verification missions, participant impact and reviewer workspace. See [the frontend guide](./docs/frontend.md) for demo/live modes and a four-minute presentation walkthrough.

See [live setup and verification](./docs/live-verification.md) for guarded non-production fixtures, completed hosted checks and remaining acceptance work.

## Development

```bash
pnpm install
pnpm dev
```

Copy `.env.example` to `.env.local` before enabling Supabase or AI integrations.

## Backend setup

1. Create a Supabase project and apply the SQL files in `supabase/migrations` in filename order.
2. Copy `.env.example` to `.env.local` and provide the Supabase URL, anonymous key, service-role key, and Gemini API key.
3. Assign reviewer accounts by changing `profiles.role` through a trusted service-role/admin operation.
4. Run `pnpm test`, `pnpm typecheck`, `pnpm lint`, and `pnpm build` before deployment.

The implemented backend endpoints are:

| Method | Endpoint | Purpose |
| --- | --- | --- |
| `GET` | `/api/health` | Service health check |
| `POST` | `/api/observations` | Idempotent observation submission and incident matching |
| `GET` | `/api/incidents` | Filtered incident list |
| `GET` | `/api/incidents/:id` | Evidence, mission, assessment, and timeline detail |
| `POST` | `/api/incidents/:id/assess` | Versioned multimodal evidence assessment |
| `POST` | `/api/missions` | Bounded nearby mission discovery; coordinates stay out of URLs |
| `POST` | `/api/missions/:id/responses` | Idempotent verification response |
| `POST` | `/api/uploads` | Private signed image-upload intent |
| `POST` | `/api/uploads/:id/complete` | Image verification, EXIF removal, and evidence finalization |
| `GET` | `/api/reviews` | Reviewer queue |
| `POST` | `/api/incidents/:id/reviews` | Reviewer decision and case outcome |
| `GET` | `/api/incidents/:id/export` | Reviewer-only evidence JSON with short-lived media links |
| `GET` | `/api/incidents/:id/report` | Reviewer-only print-friendly report |
| `GET`, `PATCH` | `/api/me` | Account identity, contributions and display-name update |
| `GET`, `POST` | `/api/admin` | Protected administration and audited actions |
| `GET` | `/api/me/impact` | Current participant's impact ledger |

Observation and mission-response requests require an `Idempotency-Key` header of 8–200 characters. Authentication uses the Supabase session cookies handled by `@supabase/ssr`.
