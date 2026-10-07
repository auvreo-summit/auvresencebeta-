# Auvresence cloud environment setup

Repository: auvreo-summit/auvresencebeta-

## Installation script

```bash
#!/usr/bin/env bash
set -euo pipefail
cd /workspace/auvresencebeta-
# Requires the environment's Node.js 24 runtime. Keep tracked files and lockfile unchanged.
node -e 'if (Number(process.versions.node.split(".")[0]) !== 24) throw new Error("Node.js 24 is required")'
export npm_config_cache=/workspace/.npm-cache
npx --yes bun@1.4.2 install --frozen-lockfile
npm run lint
npm test
# Do not enable AUVRESENCE_INITIALIZE_EMPTY_DATABASE during ordinary local builds.
npm run build

```

## Startup instructions

Use the existing /workspace/auvresencebeta- checkout. Each cloud task is already isolated; do not create a Git worktree unless explicitly requested. Keep tracked source, tests, dependency declarations and bun.lock unchanged. Node.js 24 is required; installation uses npm_config_cache=/workspace/.npm-cache npx --yes bun@1.4.2 install --frozen-lockfile if dependencies need refreshing.

Local development uses the repository-supported persistent loopback PostgreSQL cluster. From /workspace/auvresencebeta-, start npm run db:local in a managed long-running session and wait for 'Local PostgreSQL ready'. It retains data in ignored .local/ and generates ignored .env with random credentials; never print those credentials. It refuses an externally configured .env: preserve it and investigate rather than overwriting it. Reuse already running healthy services; do not start duplicates. Live processes do not survive publication/restoration.

For the onboarding-created local database, run npm run db:push from the same directory. This was tested both on an empty cluster and again with no changes detected. Review proposed schema changes on existing data; never run local fixture suites or apply unreviewed schema changes to an external/production database.

Start npm run dev in another managed long-running session from /workspace/auvresencebeta-. Default local settings keep ENABLE_DEMO_IDENTITIES=false and SHOWCASE_DEBUG=false. Verify HTTP 200 GET http://127.0.0.1:3000/api/health with databaseReady=true and schemaReady=true; verify GET / returns development HTML, GET /api/events returns an events array, and unauthenticated GET /api/me returns JSON HTTP 401. Do not publish localhost preview links. If a port is busy, identify the process and reuse it or stop only a service you started.

Validation: npm run lint, npm test (20 tests), npm run build. Production local mode uses npm start after build. For optional local fixture regression tests, stop only the app you started and restart with SHOWCASE_MODE=true ENABLE_DEMO_IDENTITIES=true SHOWCASE_DEBUG=true npm start; run npm run test:integration, npm run test:normal-journey, npm run test:security, npm run test:restart, npm run test:schema-recovery, npm run test:vercel-adapter. These all passed onboarding with real loopback PostgreSQL. Tests create persisted local fixtures and use synthetic identities; they do not establish real Google sign-in. Afterward terminate the actual server child as well as its npm wrapper if needed, and restore npm run dev with default flags. External AI credentials and interactive Firebase Google login were not validated and are optional for this local development workflow. Never store secret values in these instructions.

## Verified during onboarding

- Node.js 24 and Bun 1.4.2 frozen-lockfile installation.
- TypeScript checking, 20 unit tests, and production build passed.
- Integration, normal journey, security, restart persistence, schema recovery, and Vercel adapter checks passed.
- Development HTML, database/schema health, public event requests, and authentication boundary passed.
- Tracked repository files were unchanged. GitHub main matched local commit 243d41e9f8f1af01d655e6c488273ca41ed679db; push reported Everything up-to-date.

## Remaining steps and limitations

The install_script and start_skill fields were saved as a configuration draft. Review and save them in environment settings, then publish the environment. Publication and restoration in a fresh task have not been verified. Real Google sign-in and external AI providers have not been verified. This file contains no credentials or local database contents.

