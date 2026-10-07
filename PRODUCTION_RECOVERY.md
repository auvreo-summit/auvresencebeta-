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

Production API status, database/schema, Google-authenticated event persistence, two-user workflow, credentials, venue, announcements and live UnoRouter must be checked after deployment. Migrate only the actual production DATABASE_URL after inspecting its schema and reviewing the changes. No production migration has yet been performed.

**NOT READY: deployed Google/database/provider golden-path verification remains outstanding.**
