# Auvresence emergency pass — 7 October 2026

## Functional

Event creation now diagnoses database/schema failures with actionable responses. Migration commands target the runtime DATABASE_URL, preserve TLS parameters, and optionally use the explicit migration identity. Health checks validate all expected schema columns. Profile-storage failures no longer masquerade as invalid Firebase tokens. Event and organisation slugs use longer random identifiers. Real accounts default to participant without fabricated affiliations; event ownership still permits Studio access.

Acceptance, credential issuance/reactivation/revocation, and audit logging now share one transaction with an application row lock. An intentionally failed audit write was verified to roll back both acceptance and credential creation.

A real POST failure was reproduced in an isolated PostgreSQL database by removing an expected event column. The server returned 503 DATABASE_SCHEMA_OUTDATED; migration repaired that same database, then POST returned 201 and the event was re-read from PostgreSQL. This proves a repaired failure mode; it does not establish the cause of the unobserved failure on the user's machine.

## Visual

Studio now has a compact desktop sidebar, responsive mobile navigation, and a Credentials view backed by issued passes with working verification navigation. Participant greetings use sentence case. Home has a Continue my journey action. The entrance retains its central composer; decorative sparkle icons were replaced with directional icons.

## QA

- TypeScript checking and production build passed.
- 15 unit tests passed; no failures or skipped tests.
- 53 authenticated showcase API assertions passed against real PostgreSQL.
- 20 non-demo account database assertions passed, including creation by a participant-role owner, second-user application, rollback, acceptance, credential verification, private journey access and organiser isolation. This database test does not exercise Google authentication.
- Isolated schema-recovery POST test passed before/after migration.
- Chromium captured 76 screens at 1440×900, 1280×800, 390×844 and 430×932: zero page errors and zero document horizontal overflow. Primary desktop/mobile Studio and participant screenshots were visually inspected; not every captured screen received individual inspection.
- Browser creation reached persisted confirmation and Enter Studio. Deterministic Ask returned an actual event-state API answer; Escape closed its dialog. Valid issued credential verification rendered successfully.

## Limits and verdict

The latest uploaded ZIP exceeds the attachment download tool's 32 MiB limit, so this pass uses the existing repository checkout and the supplied emergency brief. No comparison against that ZIP is claimed. The actual Google-authenticated failure on the user's machine cannot be reproduced without that machine's runtime/session. Firebase verification remains enabled and unchanged; no authentication bypass was introduced.

**Local application checks passed. Live-demo readiness remains unverified until the intended Google-authenticated two-user journey is exercised.** No deployment was published. External AI/voice/vision providers and hosted database access remain unverified.

Run instructions are in README.md. Reusable cloud startup instructions are saved for environment-settings review; a draft save does not publish an environment or prove restoration in a new task.

---

The previous pass report is retained below for historical scope; its test counts and Studio navigation description predate this pass.

# Auvresence release report — 7 October 2026

The supplied archive was restored into the existing empty checkout and improved in place. Firebase, PostgreSQL, Drizzle, server-derived identity, and deterministic graph routing remain intact. The release is prepared for source delivery through GitHub. No deployment was published.

## Results

- Frozen Bun installation: passed with Bun 1.4.2 and Node 24.19.0.
- `npm run lint`: passed (TypeScript checking; no separate ESLint configuration exists).
- `npm test`: 12 passed, 0 failed, 0 skipped. Exercises shortest paths, disconnected graphs, closed connectors, accessibility, and truthful deterministic event answers.
- `npm run test:integration`: 53 assertions passed against real PostgreSQL. Includes missing/invalid identity rejection, invalid event validation, generic event creation, application/acceptance persistence, organizer access denial for a second account, credential verification/minimization, venue/floor persistence, disconnected and connected routes, session destination propagation, announcement propagation, private discovery, private-member journeys, and deterministic Ask responses.
- `npm run build`: passed. Client JavaScript is approximately 150 KB gzip; Vite still reports a single-chunk size warning.
- `npm run dev` and `npm start`: both ran successfully. Production health returned HTTP 200, `server=true`, `databaseReady=true`.
- Restart persistence: event, application, credential, floor, places, graph edge, session destination, and announcement survived stopping and restarting PostgreSQL and the application.

## Rendered and inspected

Chromium rendered primary desktop 1440×900 and mobile 390×844 layouts. The entrance was also checked at 1280×800, 430×932, and 375×812. The production visual pass captured 38 screens/states, with zero JavaScript page errors and zero document horizontal overflow.

Reviewed entrance, signed-in Home, creation, persisted creation confirmation, Studio Overview, Applications, People, Programme, Schedule, Venue, Announcements, Live, empty venue states, Participant Today, My Day, Updates, Event, Credential, participant Venue, Ask sheet, and invalid verification. Valid credential verification and an actual deterministic Ask response were also rendered and inspected. Screenshot review used full screens and contact sheets; this was not a pixel-by-pixel or exhaustive assistive-technology audit.

The conversational organize intent, browser-driven persisted event creation and Enter Studio, navigation tabs, Ask suggestion, actual event-state response, Escape dismissal, and public credential verification were exercised. Not every visible control or mutation was clicked, and no exhaustive dead-control audit is claimed.

## Work completed

- Entrance: retained the central composer; fixed narrow-screen input sizing, placeholder contrast, touch targets, and the orphan mobile separator. Removed perpetual ambient motion.
- Brand: bundled seven small font assets locally (about 156 KB total with licenses) so rendering does not rely on external font requests.
- Create: numbered identity/when/where/about structure, clearer copy, custom event types retained, persisted success screen with explicit Enter Studio.
- Studio: compact scrolling navigation; accepted-person directory and actual programme instead of unrelated fallback panels; truthful event status; existing review and schedule workflows preserved.
- Participant: mobile navigation sizing, actual Updates bulletin with priority/category/time hierarchy, event-timezone clock, fewer duplicate clock labels, truthful unassigned destinations, clipboard-success reporting only after the write succeeds.
- Venue: coherent POI icons, searchable real places, quick amenities only when mapped/open, correct floor selection, intentional empty states, working Create Venue transition, graph routing retained without direct fallback.
- Ask: server-authorized deterministic next/now/change/amenity answers; no provider call for these questions; removed hardcoded Lab 302 destination history; added dialog semantics, focus containment/restoration, Escape and backdrop dismissal, scroll locking, and mobile sizing.
- Reliability: fixed nullable venue typecheck failures, honored DATABASE_URL, loaded environment configuration before database initialization, fixed production start, exposed discovery failures with retry and structural loading, removed raw exception details from server responses.
- Privacy: public discovery excludes private/unlisted and nonpublished events; private journeys remain available to their members. Private-event access-denied errors retain the intended 404 rather than being wrapped as generic failures. Firebase token verification and authorization middleware were preserved.
- Tooling: real persistent loopback PostgreSQL helper, frozen installation, reusable cloud install/start draft, unit tests and local-only integration smoke command.

## Genericity and fixture boundaries

BANANA FESTIVAL began with zero floors, venues, sessions, and categories. Floors/places, a route, session, and announcement were then added through real server APIs; browser creation was also exercised. All results were stored in PostgreSQL.

Existing summit/lab/floor/time fixtures remain in explicitly enabled showcase seeding, Judge Console, and architecture showcase explanations. Synthetic account identifiers remain in showcase/security tools. They do not create assumptions in newly created events. Showcase snapshots can contain organizer-marked NOW sessions independent of the wall clock; those are synthetic fixtures, not proof of live-event timing.

## Limits and verdict

Real Google/Firebase interactive login and the Google-authenticated two-user golden path were not verified. The two-user integration test used signed, explicitly gated synthetic showcase identities and real PostgreSQL. External hosted PostgreSQL, AI reasoning, speech, vision, public deployment, cross-device QR scanning, every control, exhaustive accessibility, and all possible cancelled/timezone states were not verified. AI/voice/vision credentials are unconfigured; deterministic event questions were verified without them.

The release improves the existing product rather than claiming a complete reconstruction of every screen. The venue builder retains its existing forms and graph canvas. Resource editing, all credential interactions, and all external-provider paths were not comprehensively exercised.

**NOT READY FOR LIVE DEMO — the required real-Google golden path has not been verified on the intended demo deployment.** The local PostgreSQL-backed showcase and production build are operational and tested.

## Exact local run commands

From the extracted `auvresence` directory:

```bash
npx bun@1.4.2 install --frozen-lockfile
# Terminal 1, keep running:
npm run db:local
# Terminal 2:
npm run db:push
npm run dev
# Validation:
npm run lint
npm test
npm run test:integration
# Stop the development app before starting production on the same port:
npm run build
npm start
```

The local helper creates ignored local configuration and enables showcase mode explicitly; preserve an existing external `.env` instead of overwriting it. The source archive excludes environment files, credentials, database data, node_modules, and Git metadata.

Cloud `install_script` and `start_skill` were saved as a draft. Review and save them in environment settings, then publish to activate a snapshot. Draft persistence does not establish publication or fresh-task restoration.
