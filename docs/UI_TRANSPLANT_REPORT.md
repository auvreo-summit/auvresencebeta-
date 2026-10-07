# Auvresence UI transplant report

The attached `auvresencebeta--main(3).zip` was confirmed by the user as the base. Only its extracted files were modified. `auvresence.zip` remained a read-only design reference; every extracted donor file was checked against the original archive and remained identical.

## Preserved architecture

The base's Express backend, Firebase client/admin configuration, token verification, authentication middleware, PostgreSQL/Drizzle schema and queries, server authorization, event ownership and isolation, APIs, application lifecycle, credentials, announcements, deterministic venue routing, AI/context logic, API adapter, scripts and tests remain byte-for-byte unchanged. `package.json`, `bun.lock`, and `vite.config.ts` are unchanged. No backend or schema source changes were made. The existing schema was applied only to an isolated local validation database.

## Audit and adaptation

| Area | Base remains authoritative | Presentation adapted from donor |
| --- | --- | --- |
| Identity and entrance | Firebase identity, existing sign-in/navigation callbacks, server conversation endpoint and identity-change guards | Obsidian/crimson atmosphere, subtle dot texture, Space Grotesk display typography, framed central composer and quieter navigation |
| Participant | Real event context, live pulse, application/credential status, persisted schedules and updates | Event identity header, restrained action hierarchy, NOW/NEXT/WHAT CHANGED rail, responsive navigation and improved empty states |
| Studio | Existing Overview, Applications, People, Programme, Schedule, Venue, Credentials, Live, Announcements, Settings and prototype controls | Denser operational shell, crimson selected rail, precise hierarchy and calmer surfaces |
| Venue | Real floors/places/connections, server route computation, unreachable state, origin selection, accessibility and check-in semantics | Dot-grid canvas and Venue → Floors → Places → Connections → Routes guidance |
| Credential | Existing participant code, status, actual QR generator, verification URL and server verification | Metallic depth, rounded object treatment, typography and responsive QR layout; pointer tilt disabled with reduced motion |
| Creation | Existing empty form values, validation, timezone handling and POST payload | Crimson hierarchy and shared typography; donor guided forms were not imposed on unsupported base fields |
| Ask Auvresence | Existing backend, authorized event context, proposals/confirmation and provider availability | Full-height responsive conversation sheet, quieter surfaces and clearer composer sizing |

Shared colors and fonts were propagated through the base's presentation components, including existing debug/verification surfaces. The base's hardcoded participant change label `302 → 305` was replaced with the persisted session change note. No donor sample locations, profiles, counts, schedules, institutions or fabricated analytics were introduced. No new product features were added.

## Intentionally rejected donor code

- State-file/JSON store, donor API router, identity and permission model: incompatible with the working product's PostgreSQL/Firebase authority.
- Deterministic decorative QR matrix: not a scannable credential QR; the base's `QRCodeSVG` and verification token remain intact.
- Guided onboarding and event creation data models/defaults: unsupported profile/programme fields and fabricated Zurich/Switzerland/researcher/date/capacity defaults were excluded. The existing persisted creation flow remains functional.
- Donor routing and simplified event/credential types: base semantics always win.
- Photography archive captions and imagery: the supplied image provenance does not establish that they are real previous-event photographs. Existing base assets were preserved; no new image was represented as documentary event photography.

## Files changed

- `src/index.css`
- `src/App.tsx`
- `src/components/ProfileMenu.tsx`
- `src/components/JudgeModeBar.tsx`
- `src/components/LiveVenueView.tsx`
- `src/components/SecurityInspectorView.tsx`
- `src/components/StudioTools.tsx`
- `src/components/AskAuvresenceDrawer.tsx`
- `src/components/OrganiserView.tsx`
- `src/components/ExploreView.tsx`
- `src/components/CreateEventView.tsx`
- `src/components/ParticipantView.tsx`
- `src/components/ArchitectureView.tsx`
- `src/components/VerificationView.tsx`
- `src/components/ActionXRayModal.tsx`
- `src/components/EntryCanvas.tsx`

Added: four self-hosted Latin Space Grotesk WOFF2 files (400/500/600/700) and `public/fonts/space-grotesk-LICENSE.txt`, obtained from the standard npm `@fontsource/space-grotesk` package without changing application dependencies. This report is also new.

## Regression results

- `npm run lint`: passed.
- `npm test`: 20 passed, 0 failed/skipped.
- `npm run build`: passed, including the existing Vercel backend build. Existing large-client-chunk warning remains (approximately 555 kB before compression).
- `npm run test:integration`: 53 assertions passed against the transplanted app on local port 3100.
- `npm run test:normal-journey`: 20 normal-account database assertions passed.
- `npm run test:security`: 55 security and AI API assertions passed.
- `npm run test:restart`: 29 persistence/restart assertions passed.
- `npm run test:schema-recovery`: isolated missing-column failure reproduced and repaired using the unchanged schema command.
- `npm run test:vercel-adapter`: 11 handler assertions passed.
- Backend/configuration/source-of-truth integrity check: passed.
- Donor integrity check: passed.

The cloud validation used a separate database on the already available real loopback PostgreSQL service. No new embedded-postgres dependency or implementation was introduced. The supplied base already includes its existing optional local database helper and dependency; these were left unchanged. Native CachyOS installation was not exercised in this cloud container.

## Browser QA

Headless Chromium rendered the built product at 1440×900, 1280×800, 430×932, 390×844 and 375×812. Entrance, discovery, participant, schedule, credential, venue, conversation, Studio applications/overview/venue/announcements and creation were captured at every size; the empty venue was also captured. All 61 rendered screen/viewport captures had no document-level horizontal overflow. The final production-mode browser run had no uncaught browser errors.

A browser workflow also created a real local event, entered its Studio, published an announcement through the existing API (HTTP 201), verified the published heading, inspected its empty venue, and verified invalid event creation feedback. Blank name and location fields were explicitly checked. Screenshots of desktop/mobile entrance, participant, credential, venue, Studio venue, creation and conversation were visually inspected. Reduced-motion entrance visibility was corrected during QA.

Synthetic identities were explicitly enabled only for local fixture QA. Interactive Firebase Google sign-in and live external AI/voice/vision providers were not verified. The database-backed regression tests cover participant acceptance, credential verification, authorization/isolation and persistence across application restarts; they do not claim real Google-session restoration. Physical mobile keyboard behavior and every individual Studio control were not exhaustively tested.

Development-mode browsing emitted `WebSocket closed without opened` from the Vite client in this cloud environment, including with the existing DISABLE_HMR setting. This does not occur in the tested production build. Backend and Vite configuration were left unchanged rather than altering the working architecture for a cloud-specific warning.

## Exact native PostgreSQL localhost commands

Use Node.js 24 and Bun 1.4.2. From the extracted `auvresencebeta--main` directory:

```bash
npx --yes bun@1.4.2 install --frozen-lockfile
```

With the user's stated native local database already running, and after reviewing any schema changes against existing local data:

```bash
DATABASE_URL='postgresql://auvresence:auvresence@127.0.0.1:5432/auvresence' npm run db:push
DATABASE_URL='postgresql://auvresence:auvresence@127.0.0.1:5432/auvresence' npm run dev
```

The ordinary run keeps fixture identities/debug facilities disabled unless an existing `.env` explicitly enables them. The app listens on port 3000. Check `/api/health` for HTTP 200, `databaseReady: true`, and `schemaReady: true`. The packaged download excludes the cloud `.env`, database contents, node_modules and generated builds.

## Exact Technovate golden demo path

For the existing explicit fixture demo only, against local data:

```bash
DATABASE_URL='postgresql://auvresence:auvresence@127.0.0.1:5432/auvresence' SHOWCASE_MODE=true ENABLE_DEMO_IDENTITIES=true SHOWCASE_DEBUG=true npm run dev
```

1. Open the application locally and select **Explore Events**.
2. Select **TECHNOVATE** in the footer to open the existing clearly labeled synthetic-identity console.
3. Use **START 2-MIN DEMO** to prepare the existing unapplied fixture. Select **01 APPLY** and submit the participant application.
4. Select **02 REVIEW**, inspect the application in Studio, and accept it using the existing review control (**03 ACCEPT** points to the same workflow).
5. Select **04 CREDENTIAL** to view the real issued credential and use **Verify Credential**.
6. Select **05 LIVE UPDATE**, update the workshop's assigned venue in the existing schedule UI, and save.
7. Select **06 AI** and ask where to go next. Authorized event-state answers work without a live external AI key; free-form intelligence truthfully reports unavailable when unconfigured.
8. Switch to Participant to inspect Today, My Day, Updates and Venue; use the real connected route rather than an invented destination.
9. Restart the app, reopen the explicit fixture console and reissue the synthetic session. Persisted event/application/credential/schedule/venue/announcement data remains in PostgreSQL; old synthetic sessions intentionally expire.
10. **07 SECURITY** opens the existing local security checks. Disable fixture/debug flags for normal use.

## Delivery

The downloadable source archive contains the modified base only. A separate visual QA archive contains screenshots and browser results. No deployment or GitHub push was performed for this transplant; the previously connected checkout was not modified.
