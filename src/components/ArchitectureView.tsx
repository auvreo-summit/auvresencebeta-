import React from 'react';
import { ArrowDown, ArrowRight } from 'lucide-react';

interface ArchitectureViewProps {
  onNavigateTab: (tab: 'EXPERIENCE' | 'ORGANISE' | 'LIVE' | 'SECURITY') => void;
  onOpenAskAuvresence: (question?: string) => void;
}

export const ArchitectureView: React.FC<ArchitectureViewProps> = ({
  onNavigateTab,
  onOpenAskAuvresence,
}) => {
  return (
    <div className="max-w-[1280px] mx-auto px-6 py-10 space-y-14">
      {/* HEADER */}
      <div className="border-b border-[#E6C887]/20 pb-6 space-y-2">
        <p className="text-xs font-mono text-[#E6C887]">
          SYSTEM ARCHITECTURE · ENGINEERING X-RAY
        </p>
        <h1 className="text-3xl sm:text-4xl font-display font-semibold text-[#FCFAF7]">
          How Auvresence Connects Organiser, Participant, Venue, and AI
        </h1>
        <p className="text-sm text-[#FCFAF7]/75 max-w-3xl">
          Explanatory architectural reference detailing the server-authoritative
          request pipeline, the AI context boundary, the 12-table PostgreSQL
          schema, and the future Auvresence roadmap.
        </p>
      </div>

      {/* TWO-PIPELINE DIAGRAM: CORE TRANSACTION PIPELINE & AI CONTEXT BOUNDARY */}
      <div className="grid lg:grid-cols-2 gap-8">
        {/* Pipeline 1: Operational State Pipeline */}
        <div className="border border-[#E6C887]/30 bg-[#120608] p-8 space-y-6">
          <div className="border-b border-[#E6C887]/20 pb-4">
            <p className="text-xs font-mono text-[#E6C887]">
              PIPELINE 01 · TRANSACTIONAL STATE AUTHORITY
            </p>
            <h2 className="text-2xl font-display font-semibold text-[#FCFAF7] mt-1">
              Operational Request & Mutation Path
            </h2>
          </div>

          <div className="space-y-2">
            {[
              {
                step: 'USER (PARTICIPANT / ORGANISER / PUBLIC VERIFIER)',
                detail: 'React + TypeScript SPA over HTTPS',
              },
              {
                step: 'FIREBASE AUTHENTICATION & TOKEN VERIFICATION',
                detail:
                  'Bearer token verified on server via Firebase Admin SDK / HMAC signature',
              },
              {
                step: 'EXPRESS API ROUTER',
                detail: 'Server-side endpoints (/api/*) isolating secrets from client',
              },
              {
                step: 'ROLE & RESOURCE AUTHORIZATION',
                detail:
                  'Enforces activeRole, event_organisers binding, and userId ownership',
              },
              {
                step: 'ZOD INPUT VALIDATION',
                detail:
                  'Validates params and request bodies before business logic execution',
              },
              {
                step: 'BUSINESS LOGIC & DRIZZLE ORM',
                detail:
                  'Type-safe relational queries, credential token generation, audit logging',
              },
              {
                step: 'CLOUD SQL POSTGRESQL DATABASE',
                detail:
                  '12 normalized tables serving as single source of truth',
              },
              {
                step: 'PARTICIPANT / ORGANISER / VENUE EXPERIENCE',
                detail:
                  'Synchronised state across Event Pulse, QR Verifier, and Venue Map',
              },
            ].map((node, index, arr) => (
              <React.Fragment key={node.step}>
                <div className="p-3.5 bg-[#080203] border border-[#E6C887]/25 flex items-center justify-between gap-4">
                  <div>
                    <p className="text-xs font-mono font-semibold text-[#E6C887]">
                      {node.step}
                    </p>
                    <p className="text-xs text-[#FCFAF7]/70 mt-0.5">
                      {node.detail}
                    </p>
                  </div>
                  <span className="text-xs font-mono text-[#E6C887]/60 tabular-nums">
                    0{index + 1}
                  </span>
                </div>
                {index < arr.length - 1 && (
                  <div className="flex justify-center py-0.5">
                    <ArrowDown className="w-3.5 h-3.5 text-[#E6C887]/60" />
                  </div>
                )}
              </React.Fragment>
            ))}
          </div>
        </div>

        {/* Pipeline 2: Context-Bounded AI Path */}
        <div className="border border-[#E6C887]/30 bg-[#120608] p-8 flex flex-col justify-between space-y-6">
          <div className="space-y-6">
            <div className="border-b border-[#E6C887]/20 pb-4">
              <p className="text-xs font-mono text-[#E6C887]">
                PIPELINE 02 · LAYER 5 AI SECURITY BOUNDARY
              </p>
              <h2 className="text-2xl font-display font-semibold text-[#FCFAF7] mt-1">
                Context-Bounded AI Execution Path
              </h2>
            </div>

            <div className="space-y-2">
              {[
                {
                  step: 'AUTHENTICATED PARTICIPANT QUESTION',
                  detail:
                    'Client sends only { eventId, question } — never raw context',
                },
                {
                  step: 'IDENTITY & ELIGIBILITY VERIFICATION',
                  detail:
                    'Server resolves verified userId and event application status',
                },
                {
                  step: 'SERVER-SIDE AUTHORISED CONTEXT BUILDER',
                  detail:
                    'Queries PostgreSQL for current schedule, venue updates, and permitted announcements only',
                },
                {
                  step: 'CONFIGURABLE AI PROVIDER (GEMINI)',
                  detail:
                    'Model resolved via environment variables (AI_PROVIDER / AI_MODEL)',
                },
                {
                  step: 'GROUNDED PARTICIPANT RESPONSE',
                  detail:
                    'Reflects real-time database changes (e.g. Lab 302 → Lab 305) without exposing private peer data',
                },
              ].map((node, index, arr) => (
                <React.Fragment key={node.step}>
                  <div className="p-4 bg-[#080203] border border-[#E6C887]/25 flex items-center justify-between gap-4">
                    <div>
                      <p className="text-xs font-mono font-semibold text-[#E6C887]">
                        {node.step}
                      </p>
                      <p className="text-xs text-[#FCFAF7]/70 mt-0.5">
                        {node.detail}
                      </p>
                    </div>
                    <span className="text-xs font-mono text-[#E6C887]/60 tabular-nums">
                      0{index + 1}
                    </span>
                  </div>
                  {index < arr.length - 1 && (
                    <div className="flex justify-center py-0.5">
                      <ArrowDown className="w-3.5 h-3.5 text-[#E6C887]/60" />
                    </div>
                  )}
                </React.Fragment>
              ))}
            </div>
          </div>

          <div className="p-5 bg-[#17090C] border border-[#E6C887]/35 space-y-3">
            <p className="text-xs font-mono text-[#E6C887]">
              ARCHITECTURAL INVARIANT
            </p>
            <p className="text-xs text-[#FCFAF7]/85 leading-relaxed">
              Gemini is never the security authority. The Express server
              determines what records a participant is permitted to see{' '}
              <strong>before</strong> constructing the prompt context.
            </p>
            <button
              onClick={() => onOpenAskAuvresence('Where do I go next?')}
              className="text-xs font-semibold text-[#E6C887] hover:text-[#E6C887] inline-flex items-center gap-1.5 cursor-pointer"
            >
              Test Context-Bounded AI Now
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>

      {/* GOLDEN PATH INTERACTIVE WALKTHROUGH */}
      <div className="border border-[#E6C887]/30 bg-[#120608] p-8 space-y-6">
        <div className="border-b border-[#E6C887]/20 pb-4 flex flex-col sm:flex-row sm:items-end justify-between gap-4">
          <div>
            <p className="text-xs font-mono text-[#E6C887]">
              TECHNOVATE LIVE DEMONSTRATION SEQUENCE
            </p>
            <h2 className="text-2xl font-display font-semibold text-[#FCFAF7] mt-1">
              End-to-End Connected State Proof
            </h2>
          </div>
          <span className="text-xs font-mono text-[#E6C887]/80">
            Account A (Participant) ↔ Account B (Organiser)
          </span>
        </div>

        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4 text-xs">
          <div className="p-4 bg-[#080203] border border-[#E6C887]/20 flex flex-col justify-between space-y-4">
            <div className="space-y-1.5">
              <p className="font-mono text-[#E6C887]">STAGE 01 · APPLY</p>
              <p className="font-semibold text-[#FCFAF7] text-sm">
                Participant Discovers & Applies
              </p>
              <p className="text-[#FCFAF7]/70 leading-relaxed">
                Participant submits application in Participant Space. Record is
                stored in PostgreSQL with UNDER_REVIEW status.
              </p>
            </div>
            <button
              onClick={() => onNavigateTab('EXPERIENCE')}
              className="text-left font-semibold text-[#E6C887] hover:text-[#E6C887] cursor-pointer"
            >
              Go to Participant Space →
            </button>
          </div>

          <div className="p-4 bg-[#080203] border border-[#E6C887]/20 flex flex-col justify-between space-y-4">
            <div className="space-y-1.5">
              <p className="font-mono text-[#E6C887]">STAGE 02 · ACCEPT & QR</p>
              <p className="font-semibold text-[#FCFAF7] text-sm">
                Organiser Reviews & Provisions QR
              </p>
              <p className="text-[#FCFAF7]/70 leading-relaxed">
                Organiser accepts application. Server generates opaque
                verification token (/verify/&lt;token&gt;) and activates
                Digital Credential.
              </p>
            </div>
            <button
              onClick={() => onNavigateTab('ORGANISE')}
              className="text-left font-semibold text-[#E6C887] hover:text-[#E6C887] cursor-pointer"
            >
              Go to Organiser Command Centre →
            </button>
          </div>

          <div className="p-4 bg-[#080203] border border-[#E6C887]/20 flex flex-col justify-between space-y-4">
            <div className="space-y-1.5">
              <p className="font-mono text-[#E6C887]">
                STAGE 03 · DYNAMIC VENUE
              </p>
              <p className="font-semibold text-[#FCFAF7] text-sm">
                Lab 302 → Lab 305 Propagation
              </p>
              <p className="text-[#FCFAF7]/70 leading-relaxed">
                Organiser moves 12:30 AI Workshop from Lab 302 to Lab 305.
                Participant Space, Venue Map, and Ask Auvresence update
                immediately.
              </p>
            </div>
            <button
              onClick={() => onNavigateTab('LIVE')}
              className="text-left font-semibold text-[#E6C887] hover:text-[#E6C887] cursor-pointer"
            >
              Go to Live Venue Map →
            </button>
          </div>

          <div className="p-4 bg-[#080203] border border-[#E6C887]/20 flex flex-col justify-between space-y-4">
            <div className="space-y-1.5">
              <p className="font-mono text-[#E6C887]">
                STAGE 04 · SECURITY PROOF
              </p>
              <p className="font-semibold text-[#FCFAF7] text-sm">
                6-Check Security Verification
              </p>
              <p className="text-[#FCFAF7]/70 leading-relaxed">
                Run live HTTP security probes verifying 401 Identity, 403
                Isolation, 400 Zod Validation, and minimal public QR data.
              </p>
            </div>
            <button
              onClick={() => onNavigateTab('SECURITY')}
              className="text-left font-semibold text-[#E6C887] hover:text-[#E6C887] cursor-pointer"
            >
              Go to Security Inspector →
            </button>
          </div>
        </div>
      </div>

      {/* CLEARLY LABELLED FUTURE ROADMAP (SECTION 28) */}
      <div className="border border-[#E6C887]/25 bg-[#120608] p-8 space-y-6">
        <div className="border-b border-[#E6C887]/20 pb-4 flex flex-col sm:flex-row sm:items-end justify-between gap-4">
          <div>
            <p className="text-xs font-mono text-[#E6C887]">
              ROADMAP · FUTURE CAPABILITIES (NOT CLAIMED AS OPERATIONAL TONIGHT)
            </p>
            <h2 className="text-2xl font-display font-semibold text-[#FCFAF7] mt-1">
              Long-Term Auvresence Platform Evolution
            </h2>
          </div>
          <span className="text-xs font-mono text-[#E6C887]/70">
            Explicitly Separated from Showcase Scope
          </span>
        </div>

        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4 text-xs">
          {[
            {
              title: 'QR Attendance & Session Gate Check-In',
              desc: 'Dedicated volunteer scanner mode for per-session attendance reconciliation and capacity tracking.',
            },
            {
              title: 'Richer Indoor Spatial Navigation',
              desc: 'Multi-floor turn-by-turn routing graphs and accessibility-aware corridor pathfinding.',
            },
            {
              title: 'Post-Event Auvresence Replay & Certificates',
              desc: 'Verifiable post-event participation transcripts, session summaries, and downloadable credentials.',
            },
            {
              title: 'Organiser Operational Analytics & Forecasting',
              desc: 'Longitudinal cohort telemetry, room utilisation heatmaps, and bottleneck alerts.',
            },
            {
              title: 'Multi-Role Event Team Workflows',
              desc: 'Granular sub-roles for track chairs, hospitality desks, security staff, and speaker liaisons.',
            },
            {
              title: 'Cross-Event Participant Identity Network',
              desc: 'Portable delegate portfolio allowing seamless application across institutional summits.',
            },
          ].map((item) => (
            <div
              key={item.title}
              className="p-4 bg-[#080203] border border-[#E6C887]/15 space-y-1.5"
            >
              <div className="flex items-center justify-between font-mono text-[11px] text-[#E6C887]/75">
                <span>FUTURE ROADMAP</span>
                <span>PLANNED</span>
              </div>
              <h3 className="text-sm font-semibold text-[#FCFAF7]">
                {item.title}
              </h3>
              <p className="text-[#FCFAF7]/70 leading-relaxed">{item.desc}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
