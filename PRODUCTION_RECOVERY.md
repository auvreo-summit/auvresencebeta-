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

Neon **auvresence-production** was provisioned on the verified **free_v3** plan in iad1 and connected to Production only, with Neon auth disabled so Firebase remains the identity provider. Vercel supplied the actual **DATABASE_URL** securely. A new production deployment received that binding.

**UNOROUTER_API_KEY** remains absent. It must be entered through Vercel's secure environment-variable UI, targeting Production, followed by a new production deployment. No secret values were requested in chat or printed. The local database is not the production database.

Firebase clients and Admin verify against the existing configured Firebase project. Actual deployed Google sign-in and token verification remain mandatory checks; the absence of a service-account variable alone does not prove ID-token verification fails.

## Validation limits

Type checking, 20 unit tests and the Vite build pass. The exported handler passed 11 checks against real local PostgreSQL, without fixture identities or writes. The actual compiled Vercel Node 24 function loaded successfully and returned local database health 200 and unauthenticated `/api/me` 401. A Vercel build generated a Node 24 API function. These local checks are not a deployed golden path.

## Actual deployed results

Production recovery progressed through deployment `dpl_G2bmFUWL44ro6V7kRxMveQfGbYGY` (runtime restored), a redeployment with the Neon binding (database connected, schema missing), and `dpl_82XgsVHuKJ1QjpPo3mn4f4BKXSp5` at commit `d287f86` (actual production schema initialized). Requests to `www.auvreo.org` now reach the actual backend:

| Layer | Result | Deployed evidence / blocker |
| --- | --- | --- |
| Frontend/domain | PASS | Frontend HTTP 200; apex redirects to www. |
| API routing | PASS | Real Express JSON responses; unknown API HTTP 404. |
| Express runtime | PASS | Function starts; request logs corroborate responses. |
| /api/health | PASS | HTTP 200, server=true, databaseReady=true, schemaReady=true. |
| /api/me protection | PASS | Missing and invalid identities return HTTP 401; unauthenticated event POST also returns 401. |
| Real Google authentication | FAIL — unverified | No real deployed Google-authenticated session tested. |
| PostgreSQL connection/schema | PASS | Actual Neon connection and complete schema validated by deployed health; event discovery HTTP 200. |
| Production environment | FAIL | Runtime/database bindings configured; UNOROUTER_API_KEY absent. |
| Event creation/persistence/reload | FAIL — unverified | Awaiting real Google-authenticated browser creation. |
| Organiser → participant workflow | FAIL — unverified | Requires two real Google accounts. |
| Credentials, venue, announcements | FAIL — blocked | Required deployed workflow not executed. |
| UnoRouter | FAIL | Provider endpoint without a key returns HTTP 401; production key absent. |
| Database-backed Ask | PASS | Deployed /api/ai/ask answered the platform information question with HTTP 200 and provider=event-state. Personal event answers still require the authenticated golden path. |
| Deployed golden path | FAIL — not executed | Real Google workflow and provider key remain prerequisites. |

Vercel initially required the account owner's browser acceptance of Neon's marketplace terms. After the user accepted, provisioning and production connection succeeded. The new database was empty. This workspace's direct Neon DNS/HTTPS routes were blocked, so initialization ran from Vercel's actual production build environment against its DATABASE_URL.

`scripts/initialize-production-db.mjs` exports the schema from Drizzle, opens a transaction with an advisory lock, refuses any initial schema write when public base tables already exist, and applies the 14-table initial schema atomically. Real production build logs confirmed successful initialization. Deployed health then returned 200/schemaReady=true. The temporary `AUVRESENCE_INITIALIZE_EMPTY_DATABASE` binding was removed afterward; ordinary future builds do not execute schema writes. This initializer is not an automatic upgrade path for existing data.

Configure the server-only UnoRouter key through https://vercel.com/auvreo-international/auvresencebeta/settings/environment-variables, targeting Production. Its endpoint URL is already configured and cannot replace an authentication key. Never paste secret values in chat.

Migrate only the actual production DATABASE_URL after inspecting its schema and reviewing the changes. These deployed results establish restored routing/runtime, not readiness of the full application.

**NOT READY: deployed Google/database/provider golden-path verification remains outstanding.**
