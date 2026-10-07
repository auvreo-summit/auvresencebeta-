# Auvresence

An event operating system: one identity, participant journeys, and Organiser Studio. React/Vite and Express use Firebase authentication and PostgreSQL through Drizzle. Venue routing uses the persisted venue graph; disconnected places never receive invented directions.

## Requirements

Node.js 24 and Bun 1.4.2. Use the committed Bun lockfile:

```bash
bun install --frozen-lockfile
```

If Bun is unavailable, `npx bun@1.4.2 install --frozen-lockfile` runs the same installer.

## Run with a real local development database

In the project directory, terminal 1:

```bash
npm run db:local
```

This starts PostgreSQL on loopback, preserves its data in ignored `.local/`, and generates an ignored `.env` with random local credentials. It refuses to overwrite an existing externally configured `.env`. Local settings explicitly enable labeled synthetic showcase identities. Stop this command with Ctrl+C when finished.

Terminal 2:

```bash
npm run db:push
npm run dev
```

The app listens on port 3000. Schema push is needed for a fresh or outdated local database; review schema changes before applying it to existing data. `GET /api/health` must return HTTP 200 and `databaseReady: true` and `schemaReady: true`. A connected but outdated database returns HTTP 503 with `database: "needs-schema-update"`; review and run `npm run db:push` against that database before retrying creation.

For the existing showcase: choose **Explore Events**, then **TECHNOVATE** in the footer. The console switches between clearly labeled synthetic identities. Event mutations and credentials persist in real PostgreSQL. The normal entrance retains Google sign-in; showcase accounts are not proof that Firebase login works on your deployed domain.

## Use an existing database and real identity

Set `DATABASE_URL`, or the `SQL_HOST`, `SQL_DB_NAME`, `SQL_USER`, and `SQL_PASSWORD` fields in `.env` using `.env.example` as a reference. Schema commands target the same `DATABASE_URL`, preserving its TLS parameters. Optional `SQL_ADMIN_USER`/`SQL_ADMIN_PASSWORD` override only the migration identity. Without a URL, both runtime and migration commands use the SQL host/database fields and optional `SQL_PORT` (default 5432).

For normal deployment, set `SHOWCASE_MODE=false`. Configure Google sign-in and authorized domains for the Firebase project specified by `firebase-applet-config.json`; validate real user login and server token verification on that address. Do not run the local smoke tests against production data.

AI reasoning requires the existing provider/model configuration and its credentials. Questions about next/now, published changes, and mapped amenities are answered directly from authorized event data. Voice and vision remain optional.

## Validation and production

```bash
npm run lint
npm test
npm run build
npm start
```

`lint` is TypeScript checking. `npm start` runs the Express server in production mode and serves the built client. With a local running app, database, and `SHOWCASE_MODE=true`:

```bash
npm run test:integration
npm run test:normal-journey
npm run test:schema-recovery
```

The additional normal-journey test uses database-only non-demo accounts and checks atomic acceptance/credential rollback. The schema-recovery test creates an isolated local database, reproduces a missing-column POST failure, migrates that same database, and verifies successful creation and persistence. These tests require loopback PostgreSQL and never verify interactive Google authentication.

The smoke test creates a BANANA FESTIVAL fixture, checks isolation and persistence, then makes it private so it does not remain in public discovery. It uses signed showcase identities, not Firebase test bypasses. See `RELEASE_REPORT.md` for the tested scope and limitations.
