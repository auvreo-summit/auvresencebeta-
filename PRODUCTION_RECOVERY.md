# Auvresence production recovery — 7 October 2026

Project: **auvreo-international / auvresencebeta**. Canonical application domain: **www.auvreo.org**; **auvreo.org** redirects there.

## Confirmed original failure

The deployed frontend returned HTTP 200. `/api/health`, `/api/me` and `/api/events` returned HTTP 404 with `The page could not be found`, not the Express API's responses. Vercel's production project was configured as Vite, deployed commit `1afb690`, and had zero configured project environment variables. Its real build logs showed only `vite build` and static output deployment. The repository had no API function or routing configuration.

## Deployment-only repairs

- `api/index.ts` exports the existing Express backend; `server.ts` retains standalone local startup and skips listening inside Vercel.
- `vercel.json` preserves the Vite frontend build and explicitly routes API requests to the Node function, with frontend navigation fallback.
- `api/tsconfig.json` avoids importing frontend ambient types into Vercel's isolated transpilation.
- `scripts/build-vercel-backend.mjs` bundles the existing backend/dependencies into CommonJS for Vercel's loader. The first real function deployment failed with `ERR_REQUIRE_ESM` in `jwks-rsa` loading `jose`; runtime logs established this failure. Firebase Admin and cryptographic dependency versions are unchanged.
- `src/lib/firebase-admin.ts` adds the JSON import attribute required by plain Node 24. The compiled function originally failed with `ERR_IMPORT_ATTRIBUTE_MISSING`; this is now repaired.
- Unknown API paths return JSON 404 instead of falling through to an HTML SPA.
- `.vercelignore` excludes local environment files and database data; `.gitignore` excludes local Vercel credentials/output.

No visual system, Firebase authentication bypass, database substitute or existing business workflow was introduced.

## Configuration

Production non-secret bindings were saved: `AI_PROVIDER=unorouter`, `AI_MODEL=gpt-oss-20b:free`, `APP_URL=https://www.auvreo.org`, and `SHOWCASE_MODE=false`, `ENABLE_DEMO_IDENTITIES=false`, `SHOWCASE_DEBUG=false`.

Required server-only secret bindings: **DATABASE_URL** (actual production PostgreSQL) and **UNOROUTER_API_KEY**. They must be entered through Vercel's secure environment-variable UI, targeting Production, followed by a new production deployment. No secret values were requested in chat or printed. The local database is not the production database.

Firebase clients and Admin verify against the existing configured Firebase project. Actual deployed Google sign-in and token verification remain mandatory checks; the absence of a service-account variable alone does not prove ID-token verification fails.

## Validation limits

Type checking, 20 unit tests and the Vite build pass. The exported handler passed 11 checks against real local PostgreSQL, without fixture identities or writes. The actual compiled Vercel Node 24 function loaded successfully and returned local database health 200 and unauthenticated `/api/me` 401. A Vercel build generated a Node 24 API function. These local checks are not a deployed golden path.

## Actual deployed results

Production deployment `dpl_G2bmFUWL44ro6V7kRxMveQfGbYGY` serves commit `3b2e14d`. Requests to `www.auvreo.org` now reach the actual backend:

| Layer | Result | Deployed evidence / blocker |
| --- | --- | --- |
| Frontend/domain | PASS | Frontend HTTP 200; apex redirects to www. |
| API routing | PASS | Real Express JSON responses; unknown API HTTP 404. |
| Express runtime | PASS | Function starts; request logs corroborate responses. |
| /api/health | FAIL | HTTP 503, server=true, databaseReady=false, schemaReady=false. |
| /api/me protection | PASS | Missing and invalid identities return HTTP 401; unauthenticated event POST also returns 401. |
| Real Google authentication | FAIL — unverified | No real deployed Google-authenticated session tested. |
| PostgreSQL | FAIL | DATABASE_URL absent; actual runtime logs show ECONNREFUSED. |
| Production environment | FAIL | Non-secret bindings configured; DATABASE_URL and UNOROUTER_API_KEY absent. |
| Event creation/persistence/reload | FAIL — blocked | Production database unavailable. |
| Organiser → participant workflow | FAIL — blocked | Requires database and two real Google accounts. |
| Credentials, venue, announcements | FAIL — blocked | Required deployed workflow not executed. |
| UnoRouter | FAIL | Provider endpoint without a key returns HTTP 401; production key absent. |
| Deployed golden path | FAIL — not executed | Database, real Google authentication and provider key remain prerequisites. |

No marketplace installation or attached database resource exists. Provisioning was attempted with Neon free_v3, iad1, Production only, auth=false (Firebase retained). Vercel returned `integration_terms_acceptance_required`: the account owner must accept https://vercel.com/auvreo-international/~/integrations/accept-terms/neon?source=cli before provisioning can finish. No database was created or production migration performed. After terms acceptance, resume provisioning, inspect the actual database, apply the reviewed schema, and create a new production deployment.

Configure the server-only UnoRouter key through https://vercel.com/auvreo-international/auvresencebeta/settings/environment-variables, targeting Production. Its endpoint URL is already configured and cannot replace an authentication key. Never paste secret values in chat.

Migrate only the actual production DATABASE_URL after inspecting its schema and reviewing the changes. These deployed results establish restored routing/runtime, not readiness of the full application.

**NOT READY: deployed Google/database/provider golden-path verification remains outstanding.**
