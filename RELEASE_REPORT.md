# AUVRESENCE FINAL QA

7 October 2026. Source delivery only; no deployment was published.

| Area | Result | Evidence or limitation |
| --- | --- | --- |
| AUTH | FAIL | Real interactive Google sign-in and restoration have not been verified. Invalid supplied identities are rejected; fixture identities require explicit opt-in. |
| DATABASE | PASS | Real loopback PostgreSQL, schema migration and transaction rollback checks. |
| EVENT CREATION | FAIL | Database/API and browser creation passed; required real Google-authenticated creation remains unverified. |
| ORGANISER STUDIO | PASS | Implemented settings, session creation/editing without a venue, application review, credentials, venues and announcements exercised. |
| PARTICIPANT JOURNEY | FAIL | Two-user fixture browser journey and non-demo database journey passed; real Google two-user journey remains unverified. |
| VENUE | PASS | Persisted floors, places, edges, explicit route origin and check-in; disconnected routes never invent guidance. |
| CREDENTIAL | PASS | Acceptance, verification, revoke/reactivate and rejection restrictions checked. |
| ANNOUNCEMENTS | PASS | Persisted publishing; guest, pending, accepted and rejected audience isolation checked. |
| ASK AUVRESENCE | FAIL | Authorized database answers work. Live free-form provider requires an unconfigured API key; live conversation is unverified. |
| AUTOMATIONS PROTOTYPE | PASS | Clearly labeled editable prototype; default email provider sends no email. |
| SECURITY | PASS | Local authorization, cross-event references, identity rejection, data minimization, validation and rate-limit checks; not an exhaustive security audit. |
| RESPONSIVE | PASS | Chromium at 1440×900, 1280×800, 430×932, 390×844 and 375×812; 104 states, no page errors or horizontal document overflow. |
| TYPECHECK | PASS | npm run lint. |
| TESTS | PASS | 20 unit tests; 53 integration, 55 security, 20 non-demo database, 29 restart and 28 browser workflow assertions; isolated schema-recovery test passed. |
| BUILD | PASS | Production build; existing single JavaScript chunk warning remains (approximately 154 KB gzip). |
| PERSISTENCE AFTER RESTART | PASS | Server restart preserved event, application, credential, venue, session, announcement and settings. Google session restoration was not tested. |

## Files changed and resulting behavior

- `server.ts`, `src/middleware/auth.ts`, `src/middleware/rate-limit.ts`: explicit fixture/debug opt-in, strict identity handling, authorized guest AI, bounded requests, safe JSON errors and transport headers.
- `src/db/{queries,schema,errors}.ts`: atomic writes/audits, application and credential locking, same-event references, floor foreign key, private-event and audience boundaries, useful storage failures.
- `src/lib/{ai,ai-provider,unorouter-provider,gemini-provider,conversation,event-answers}.ts`: real provider requests with bounded history, server-controlled instructions, timeouts and optional fallback; factual answers use authorized PostgreSQL data. Missing keys produce an honest unavailable response.
- `src/App.tsx`, `src/components/{EntryCanvas,AskAuvresenceDrawer,JudgeModeBar}.tsx`: real API-backed entrance conversations, identity-switch race guards, redirect intent restoration, private journey navigation and hidden debug controls by default.
- `src/components/{StudioTools,OrganiserView,ParticipantView,LiveVenueView}.tsx`, `src/hooks/useDialogFocus.ts`: persisted settings/session operations, accessible dialogs and application rows, actual application requirements, credential actions, explicit venue origin and organizer-only waypoint QR.
- `src/lib/email-provider.ts`: unavailable email-provider boundary; automation previews never claim delivery.
- `.env.example`, `scripts/local-db.mjs`, `package.json`, regression scripts and tests: reproducible safe defaults and expanded checks.
- `README.md`, this report: current run instructions and verification limits.

## Real flows verified

The production browser submitted a new generic event and entered Studio, created and edited a session without a venue, saved settings, created a floor/two places/an edge, published an announcement, submitted a second fixture user's application, accepted it, revoked/reactivated its credential, made the event private, opened the participant journey, asked an actual database question, routed from a selected origin, checked in and signed out. Requests reached the real server and PostgreSQL. Browser identities were explicitly signed test fixtures, not Google users.

Database-only non-demo accounts separately verified creation/ownership, application, acceptance, credential verification, rollback and private isolation. Schema recovery reproduced a real POST failure in an isolated outdated database, migrated that same database and verified successful POST plus SQL persistence. This does not establish the exact cause of the uncaptured error on the user's machine.

Provider tests use controlled transport stubs solely in tests to verify request shape, bounded timeout and fallback. They do not prove the external provider works. Responsive checks capture all five requested sizes; selected critical screens were inspected, not every screenshot pixel or every possible interaction.

## Coming Soon / unavailable

Email automations are explicitly a prototype and send no emails. Voice and vision are unavailable. Session deletion is explicitly unavailable. No synthetic live-provider success or automatic mutation is presented as real.

## Required configuration and remaining blockers

Set `UNOROUTER_API_KEY` securely in server/environment settings, never in chat or client code. Defaults are `AI_PROVIDER=unorouter`, `AI_MODEL=gpt-oss-20b:free`, endpoint `https://api.unorouter.com/v1/chat/completions`, timeout 14 seconds. An endpoint URL is not an API key. Optional alternate provider needs its own server credential. Configure the real deployment's Firebase authorized domains and Admin credentials, and its PostgreSQL connection.

Keep `ENABLE_DEMO_IDENTITIES=false` and `SHOWCASE_DEBUG=false` for presentation; production should also use `SHOWCASE_MODE=false`. Test fixtures require explicit local-only flags described in README. Secrets, ignored database files, attachments and generated screenshots are excluded from source delivery.

Reusable cloud install/start configuration and the UnoRouter secret requirement were saved as a draft. `api.unorouter.com` was added to restricted allowed destinations. Review/save changes in environment settings, then publish the environment to activate them. Saving the draft does not inject credentials or prove fresh-task restoration.

The latest ZIP exceeded the attachment tool's 32 MiB download limit; this work uses the existing repository and supplied text request. No comparison against that ZIP is claimed.

**FINAL VERDICT: NOT READY FOR LIVE DEMO.** Before readiness, verify real Google sign-in and the two-user create/apply/accept/credential/reload journey on the intended deployment, then verify a live three-turn free-form conversation with the securely configured provider key.
