# FirmPlant Backend

This is the API and calculation code for the FirmPlant platform. It implements **Phases 1–5 of the Backend Implementation Plan plus a basic CRM**: foundation, the public marketplace API, admin workflows, the intelligence schema and the financial engines. Later phases have their database tables and interfaces in place.

> Status: untested scaffold, v0.1. It has not been compiled or run yet. Expect to fix small type errors on the first `npm install && npm run build`.

## Stack
TypeScript monorepo · NestJS API · PostgreSQL 16 (pgvector) · Prisma · Redis · S3-compatible storage · zod validation · argon2id · Vitest.

```
packages/engines   Pure, tested calculation engines (shared with the frontend calculators)
apps/api           NestJS API, Prisma schema, seed
```

## Deploy (Vercel + Supabase)
- **Website:** Vercel project `firmplant-web` is linked to `Firmcop/firmo` with root directory `web/`. Every push to `main` deploys the site.
- **API:** add it as a second Vercel project with root `apps/api` once `npm run build` passes locally. Set these environment variables in Vercel:
  - `DATABASE_URL` and `DIRECT_URL` (from Supabase → Project Settings → Database)
  - `AUTH_SECRET`
  - `PUBLIC_WEB_ORIGIN`

  NestJS needs a small serverless entry file for Vercel (`api/index.ts` exporting the Express app). That hasn't been added yet.

First push (run from this folder after downloading it):
```bash
git init && git add . && git commit -m "FirmPlant: site prototype, backend v0.1"
git branch -M main
git remote add origin https://github.com/Firmcop/firmo.git
git push -u origin main
```

## Supabase (dev database — already provisioned)
- Project `firmplant-dev` (ref `ehccupredtuvmajsahly`, eu-central-1). All tables, enums, indexes, reference data (5 countries, 20 sectors, 16 roles, hard-stop rule) and 5 DEMO opportunities are loaded.
- Row Level Security is on for every table with **no policies**, and anon/authenticated grants are revoked, so Supabase's public REST API can't read anything. The NestJS API connects as `postgres` through `DATABASE_URL`.
- The audit log is append-only: a database trigger blocks UPDATE and DELETE.
- The schema was applied as SQL, so tell Prisma it's already in place before your first `migrate dev`:
  ```bash
  npx -w @firmplant/api prisma migrate diff --from-empty --to-schema-datamodel apps/api/prisma/schema.prisma --script > apps/api/prisma/migrations/0_init/migration.sql
  npx -w @firmplant/api prisma migrate resolve --applied 0_init
  ```
- Dev users aren't seeded yet (passwords need argon2 hashing). Run `npm run db:seed` once to create them.

## Quick start
```bash
cp .env.example .env
docker compose up -d postgres redis minio
npm install
npx -w @firmplant/api prisma migrate dev --name init
npm run db:seed
npm run dev              # http://localhost:4000/api/v1  ·  docs at /api/docs
npm test                 # engine + serializer tests
```
Dev users (all must change password on first login): `admin@`, `analyst@`, `engineer@`, `finance@`, `procurement@`, `sales@`, `management@`, `customer@` — all `@firmplant.dev`, password `ChangeMe-Dev-2026!`. **Never use these outside local development.**

## What's implemented
| Area | Where | Notes |
|---|---|---|
| Financial engine (CAPEX/OPEX, cash flow, IRR, NPV, DSCR, payback, break-even, 3 scenarios) | `packages/engines/src/financial.ts` | Deterministic; returns engine version and a hash of its inputs |
| Loan / financing calculator | `financing.ts` | Includes a grace period; unit-tested against the standard annuity formula |
| Landed cost + import vs local verdict | `landedCost.ts` | VAT excluded by default because it applies to local and imported goods alike |
| Internal 100-pt score | `scoring.ts` | Never serialised publicly (tested) |
| Hard-stop NO-GO rules | `hardStops.ts` | Thresholds stored in `hard_stop_rules`, not in code |
| State machines (opportunity, supplier, lead, RFQ) | `workflow.ts` | Each move requires the right permission |
| Build My Factory recommender | `wizard.ts` | |
| Auth: sessions, argon2id, forced password change | `apps/api/src/auth` | MFA (one-time code) is marked TODO in `auth.service.ts` |
| Access control (permissions with wildcards) | `permissions.guard.ts` + seed roles | 16 roles seeded |
| Audit log (append-only, stores only what changed) | `audit/` | Written inside the same database transaction as the change |
| Public opportunities + "I want this plant" | `opportunities/` | Allow-list serializer; disclaimers always attached |
| Research workflow: transitions, 5-stage approvals, publish checks, score, evidence, versioned models | `opportunities.service.ts` | Authors can't approve their own work; NO-GO records are blocked from publishing |
| Lead creation → assignment → notifications → qualification task; CRM stages; WON → project | `leads/` | |
| Supplier registration, directory, verification workflow | `suppliers/` | Suppliers cannot set their own status |
| Equipment catalogue + request quote | `equipment/` | |
| Public calculators | `calculators/` | Rate-limited |
| Notifications (email / SMS / WhatsApp / in-app) | `notifications/` | Console adapter by default; real providers plug in via environment variables |

## Not yet built (next)
1. **MFA** (one-time codes) and password reset by email.
2. **Documents module:** signed upload links, virus scanning, versioning. The database tables exist.
3. **BullMQ workers:** notification delivery with retries, scheduled data imports, report generation.
4. **Intelligence ingestion:** CSV importer, a trade-data adapter, and jobs for Engines 1–5 writing to `signals`.
5. **RFQ engine** endpoints (the state machine and tables exist), plus customer and supplier portals.
6. **Report generator:** financing pack as PDF, Excel and Word.
7. **Assets / Asset Passport** endpoints and QR codes (the tables exist).
8. **AI orchestration** (Phase 9).
9. **Integration and end-to-end tests** against Postgres, and an access-control test matrix.
10. **Admin UI:** the admin API is ready; no admin screens have been built yet.

## Rules the code enforces
- Nothing is public unless `publicationStatus = PUBLISHED`, which is only reachable after five approvals and complete disclosure fields.
- The public opportunity endpoint uses an explicit list of allowed fields. The internal score and workflow data cannot leak.
- Every money figure in the database is `Decimal`. Engines round only at output.
- All seed business data has `isDemo = true`.
