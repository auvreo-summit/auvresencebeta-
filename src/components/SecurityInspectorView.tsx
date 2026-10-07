import React, { useState } from 'react';
import {
  ShieldCheck,
  Play,
  CheckCircle2,
  XCircle,
  RefreshCw,
} from 'lucide-react';

interface SecurityCheckResult {
  id: string;
  title: string;
  layer: string;
  description: string;
  expectedOutcome: string;
  status: 'IDLE' | 'RUNNING' | 'PASS' | 'FAIL';
  httpMethod: string;
  endpoint: string;
  httpStatus?: number;
  latencyMs?: number;
  responsePreview?: string;
}

const INITIAL_CHECKS: SecurityCheckResult[] = [
  {
    id: 'CHECK_1',
    title: 'Identity Verification (Anonymous Request)',
    layer: 'Layer 1 — Identity',
    description:
      'Sends an unauthenticated request without a Bearer token to protected endpoint /api/me.',
    expectedOutcome: 'DENIED (HTTP 401)',
    status: 'IDLE',
    httpMethod: 'GET',
    endpoint: '/api/me',
  },
  {
    id: 'CHECK_2',
    title: 'Resource Isolation (Participant A → Participant B Application)',
    layer: 'Layer 3 — Resource Isolation (BOLA/IDOR Defense)',
    description:
      'Authenticated Participant A attempts to read Participant B’s private application record by ID.',
    expectedOutcome: 'DENIED (HTTP 403)',
    status: 'IDLE',
    httpMethod: 'GET',
    endpoint: '/api/applications/:peerApplicationId',
  },
  {
    id: 'CHECK_3',
    title: 'Role Authorization (Participant → Organiser Review Endpoint)',
    layer: 'Layer 2 — Authorization',
    description:
      'Authenticated Participant attempts to call the organiser application acceptance endpoint.',
    expectedOutcome: 'DENIED (HTTP 403)',
    status: 'IDLE',
    httpMethod: 'PATCH',
    endpoint: '/api/organiser/applications/:id/status',
  },
  {
    id: 'CHECK_4',
    title: 'Cross-Event Isolation (Organiser A → Isolated Tenant Event B)',
    layer: 'Layer 2 & 3 — Multi-Event Tenant Isolation',
    description:
      'Organiser for Auvreo Summit (Event A) attempts to administer Isolated Tenant Event B (Synthetic Security Fixture).',
    expectedOutcome: 'DENIED (HTTP 403)',
    status: 'IDLE',
    httpMethod: 'GET',
    endpoint: '/api/organiser/events/:eventBId/dashboard',
  },
  {
    id: 'CHECK_5',
    title: 'Schema Validation (Malformed Mutation Payload)',
    layer: 'Layer 4 — Zod Input Validation',
    description:
      'Sends a malformed announcement payload with empty title and invalid audience enum to a protected mutation route.',
    expectedOutcome: 'REJECTED BY VALIDATION (HTTP 400)',
    status: 'IDLE',
    httpMethod: 'POST',
    endpoint: '/api/organiser/events/:eventAId/announcements',
  },
  {
    id: 'CHECK_6',
    title: 'Public Credential Verification Privacy Audit',
    layer: 'Layer 6 — Data Minimisation',
    description:
      'Queries public /api/verify/:token endpoint and verifies that email, UID, statement, and internal IDs are omitted.',
    expectedOutcome: 'ONLY MINIMAL PUBLIC DATA (HTTP 200)',
    status: 'IDLE',
    httpMethod: 'GET',
    endpoint: '/api/verify/:token',
  },
];

export const SecurityInspectorView: React.FC<{
  onRestoreUserSession: () => Promise<void>;
}> = ({ onRestoreUserSession }) => {
  const [checks, setChecks] = useState<SecurityCheckResult[]>(INITIAL_CHECKS);
  const [runningAll, setRunningAll] = useState(false);

  const updateCheck = (id: string, patch: Partial<SecurityCheckResult>) => {
    setChecks((prev) =>
      prev.map((c) => (c.id === id ? { ...c, ...patch } : c))
    );
  };

  const runLiveSecuritySuite = async () => {
    setRunningAll(true);
    setChecks(INITIAL_CHECKS.map((c) => ({ ...c, status: 'RUNNING' })));

    try {
      // Obtain real session tokens for Participant A and Organiser B to execute the live probes
      const partRes = await fetch('/api/auth/demo-session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ account: 'PARTICIPANT_A' }),
      });
      const partSession = await partRes.json();
      const participantToken: string = partSession.token;

      // Fetch real database resource IDs for the probes
      const targetsRes = await fetch('/api/security/inspector-targets', {
        headers: { Authorization: `Bearer ${participantToken}` },
      });
      const targets = await targetsRes.json();

      // CHECK 1: Anonymous request -> /api/me (Expected 401)
      {
        const t0 = performance.now();
        const r1 = await fetch('/api/me');
        const elapsed = Math.round(performance.now() - t0);
        const body1 = await r1.json();
        updateCheck('CHECK_1', {
          status: r1.status === 401 ? 'PASS' : 'FAIL',
          httpStatus: r1.status,
          latencyMs: elapsed,
          responsePreview: JSON.stringify(body1),
        });
      }

      // CHECK 2: Participant A -> Participant B private application (Expected 403)
      {
        const t0 = performance.now();
        const endpoint = `/api/applications/${targets.peerApplicationId}`;
        const r2 = await fetch(endpoint, {
          headers: { Authorization: `Bearer ${participantToken}` },
        });
        const elapsed = Math.round(performance.now() - t0);
        const body2 = await r2.json();
        updateCheck('CHECK_2', {
          endpoint,
          status: r2.status === 403 ? 'PASS' : 'FAIL',
          httpStatus: r2.status,
          latencyMs: elapsed,
          responsePreview: JSON.stringify(body2),
        });
      }

      // CHECK 3: Participant A -> Organiser application-review endpoint (Expected 403)
      {
        const t0 = performance.now();
        const endpoint = `/api/organiser/applications/${targets.peerApplicationId}/status`;
        const r3 = await fetch(endpoint, {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${participantToken}`,
          },
          body: JSON.stringify({ status: 'ACCEPTED' }),
        });
        const elapsed = Math.round(performance.now() - t0);
        const body3 = await r3.json();
        updateCheck('CHECK_3', {
          endpoint,
          status: r3.status === 403 ? 'PASS' : 'FAIL',
          httpStatus: r3.status,
          latencyMs: elapsed,
          responsePreview: JSON.stringify(body3),
        });
      }

      // Obtain Organiser B session token for Checks 4 & 5
      const orgRes = await fetch('/api/auth/demo-session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ account: 'ORGANISER_B' }),
      });
      const orgSession = await orgRes.json();
      const organiserToken: string = orgSession.token;

      // CHECK 4: Organiser for Event A -> Unrelated Event B administration (Expected 403)
      {
        const t0 = performance.now();
        const endpoint = `/api/organiser/events/${targets.isolatedEventId}/dashboard`;
        const r4 = await fetch(endpoint, {
          headers: { Authorization: `Bearer ${organiserToken}` },
        });
        const elapsed = Math.round(performance.now() - t0);
        const body4 = await r4.json();
        updateCheck('CHECK_4', {
          endpoint,
          status: r4.status === 403 ? 'PASS' : 'FAIL',
          httpStatus: r4.status,
          latencyMs: elapsed,
          responsePreview: JSON.stringify(body4),
        });
      }

      // CHECK 5: Malformed request -> protected mutation (Expected 400)
      {
        const t0 = performance.now();
        const endpoint = `/api/organiser/events/${targets.primaryEventId}/announcements`;
        const r5 = await fetch(endpoint, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${organiserToken}`,
          },
          body: JSON.stringify({
            title: '',
            body: 'x',
            audience: 'UNAUTHORISED_AUDIENCE_ENUM',
          }),
        });
        const elapsed = Math.round(performance.now() - t0);
        const body5 = await r5.json();
        updateCheck('CHECK_5', {
          endpoint,
          status: r5.status === 400 ? 'PASS' : 'FAIL',
          httpStatus: r5.status,
          latencyMs: elapsed,
          responsePreview: JSON.stringify(body5),
        });
      }

      // CHECK 6: Public credential verification privacy audit (Expected 200 + zero private keys)
      {
        const t0 = performance.now();
        const endpoint = `/api/verify/${targets.sampleVerificationToken}`;
        const r6 = await fetch(endpoint);
        const elapsed = Math.round(performance.now() - t0);
        const body6 = await r6.json();
        const forbiddenKeys = [
          'email',
          'applicantEmail',
          'phone',
          'uid',
          'statement',
          'userId',
          'internalNotes',
        ];
        const leakedKeys = forbiddenKeys.filter((k) => k in body6);
        const passed =
          r6.status === 200 && body6.valid === true && leakedKeys.length === 0;

        updateCheck('CHECK_6', {
          endpoint,
          status: passed ? 'PASS' : 'FAIL',
          httpStatus: r6.status,
          latencyMs: elapsed,
          responsePreview: JSON.stringify(body6),
        });
      }
    } finally {
      await onRestoreUserSession();
      setRunningAll(false);
    }
  };

  const passCount = checks.filter((c) => c.status === 'PASS').length;
  const failCount = checks.filter((c) => c.status === 'FAIL').length;

  return (
    <div className="max-w-[1280px] mx-auto px-6 py-10 space-y-10">
      {/* HEADER */}
      <div className="border-b border-[#cf9f5d]/20 pb-6 flex flex-col lg:flex-row lg:items-end justify-between gap-6">
        <div className="space-y-1.5">
          <p className="text-xs font-mono text-[#cf9f5d]">
            AUVRESENCE SECURITY ARCHITECTURE · LIVE VERIFICATION SUITE
          </p>
          <h1 className="text-3xl sm:text-4xl font-display font-semibold text-[#faf6f0]">
            Security Inspector
          </h1>
          <p className="text-sm text-[#faf6f0]/75 max-w-2xl">
            Executes real HTTP requests against the Express API and PostgreSQL
            database to verify Identity, Role Authorization, Resource Isolation
            (BOLA defense), Zod Input Validation, and Credential Privacy.
          </p>
        </div>

        <button
          onClick={runLiveSecuritySuite}
          disabled={runningAll}
          className="px-6 py-3 text-xs font-semibold bg-[#cf9f5d] text-[#0d0608] hover:bg-[#edd2ab] transition-colors inline-flex items-center gap-2 cursor-pointer whitespace-nowrap disabled:opacity-50"
        >
          {runningAll ? (
            <>
              <RefreshCw className="w-4 h-4 animate-spin" />
              EXECUTING LIVE HTTP PROBES...
            </>
          ) : (
            <>
              <Play className="w-4 h-4" />
              RUN ALL 6 LIVE SECURITY CHECKS
            </>
          )}
        </button>
      </div>

      {/* SUMMARY MATRIX */}
      <div className="border border-[#cf9f5d]/30 bg-[#1a0206] p-6 grid sm:grid-cols-2 lg:grid-cols-6 gap-4">
        <div className="sm:col-span-2 lg:col-span-1 border-b sm:border-b-0 sm:border-r border-[#cf9f5d]/20 pb-4 sm:pb-0 sm:pr-4">
          <p className="text-xs font-mono text-[#cf9f5d]">AUVRESENCE SECURITY</p>
          <p className="text-2xl font-mono font-semibold text-[#faf6f0] mt-1 tabular-nums">
            {passCount} / {checks.length} PASS
          </p>
          {failCount > 0 && (
            <p className="text-xs font-mono text-red-400 mt-0.5">
              {failCount} FAILED
            </p>
          )}
        </div>

        {[
          { label: 'Identity', check: checks[0] },
          { label: 'Resource Isolation', check: checks[1] },
          { label: 'Authorization', check: checks[2] },
          { label: 'Validation', check: checks[4] },
          { label: 'Credential Privacy', check: checks[5] },
        ].map((item) => (
          <div key={item.label} className="flex flex-col justify-between">
            <span className="text-xs text-[#edd2ab]/80">{item.label}</span>
            <span
              className={`font-mono text-sm font-semibold mt-1 ${
                item.check.status === 'PASS'
                  ? 'text-emerald-300'
                  : item.check.status === 'FAIL'
                  ? 'text-red-400'
                  : 'text-[#faf6f0]/50'
              }`}
            >
              {item.check.status === 'IDLE'
                ? 'READY'
                : item.check.status === 'RUNNING'
                ? 'TESTING...'
                : item.check.status}
            </span>
          </div>
        ))}
      </div>

      {/* INDIVIDUAL LIVE CHECK CARDS */}
      <div className="grid md:grid-cols-2 gap-6">
        {checks.map((c, idx) => (
          <div
            key={c.id}
            className={`border p-6 space-y-4 ${
              c.status === 'PASS'
                ? 'border-emerald-500/40 bg-[#1a0206]'
                : c.status === 'FAIL'
                ? 'border-red-500/50 bg-red-950/20'
                : 'border-[#cf9f5d]/25 bg-[#1a0206]'
            }`}
          >
            <div className="flex items-start justify-between gap-4 border-b border-[#cf9f5d]/20 pb-3">
              <div>
                <p className="text-xs font-mono text-[#cf9f5d]">
                  CHECK 0{idx + 1} · {c.layer}
                </p>
                <h3 className="text-lg font-display font-semibold text-[#faf6f0] mt-0.5">
                  {c.title}
                </h3>
              </div>

              <span
                className={`font-mono text-xs font-semibold shrink-0 ${
                  c.status === 'PASS'
                    ? 'text-emerald-300'
                    : c.status === 'FAIL'
                    ? 'text-red-400'
                    : 'text-[#edd2ab]/60'
                }`}
              >
                {c.status === 'PASS' ? (
                  <span className="inline-flex items-center gap-1">
                    <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                    PASS
                  </span>
                ) : c.status === 'FAIL' ? (
                  <span className="inline-flex items-center gap-1">
                    <XCircle className="w-4 h-4 text-red-400" />
                    FAIL
                  </span>
                ) : (
                  c.status
                )}
              </span>
            </div>

            <p className="text-xs text-[#faf6f0]/80 leading-relaxed">
              {c.description}
            </p>

            <div className="p-3 bg-[#0d0608] border border-[#cf9f5d]/20 font-mono text-xs space-y-1.5">
              <div className="flex items-center justify-between text-[#edd2ab]">
                <span>
                  {c.httpMethod} {c.endpoint}
                </span>
                <span>Expected: {c.expectedOutcome}</span>
              </div>

              {c.httpStatus !== undefined && (
                <div className="pt-1.5 border-t border-[#cf9f5d]/15 flex items-center justify-between text-[11px] text-[#faf6f0]/70 tabular-nums">
                  <span>Actual HTTP Status: {c.httpStatus}</span>
                  <span>Latency: {c.latencyMs} ms</span>
                </div>
              )}

              {c.responsePreview && (
                <pre className="pt-1.5 text-[11px] text-[#cf9f5d] overflow-x-auto whitespace-pre-wrap break-all">
                  {c.responsePreview}
                </pre>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* 7-LAYER SECURITY ARCHITECTURE EXPLANATION */}
      <div className="border border-[#cf9f5d]/25 bg-[#1a0206] p-8 space-y-6">
        <div className="border-b border-[#cf9f5d]/20 pb-4">
          <p className="text-xs font-mono text-[#cf9f5d]">
            DEFENSIBLE ENGINEERING CONTROLS
          </p>
          <h2 className="text-2xl font-display font-semibold text-[#faf6f0] mt-1">
            Seven-Layer Server-Enforced Security Model
          </h2>
        </div>

        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-5 text-xs">
          {[
            {
              layer: 'Layer 1 · Identity',
              desc: 'Firebase ID tokens & server-signed session tokens verified on every protected request. Client-supplied userId is never trusted.',
            },
            {
              layer: 'Layer 2 · Authorization',
              desc: 'Server verifies role authority (Participant vs Organiser) before executing any operational review or schedule mutation.',
            },
            {
              layer: 'Layer 3 · Resource Isolation',
              desc: 'Every application, credential, and event administration query validates ownership and event-organiser bindings to prevent IDOR/BOLA.',
            },
            {
              layer: 'Layer 4 · Input Validation',
              desc: 'Strict Zod schemas validate parameters and request bodies on every write route, rejecting malformed payloads.',
            },
            {
              layer: 'Layer 5 · AI Boundary',
              desc: 'AI is not the security authority. The server builds minimum authorised participant context from PostgreSQL before calling Gemini.',
            },
            {
              layer: 'Layer 6 · Data Minimisation',
              desc: 'Public QR verification returns only name, role, event, code, and status—withholding email, UID, and application answers.',
            },
            {
              layer: 'Layer 7 · Auditability',
              desc: 'Meaningful organiser operations (acceptances, credential status changes, session edits, announcements) write audit logs to PostgreSQL.',
            },
          ].map((item) => (
            <div
              key={item.layer}
              className="p-4 bg-[#0d0608] border border-[#cf9f5d]/20 space-y-1.5"
            >
              <p className="font-mono text-[#cf9f5d] font-semibold">
                {item.layer}
              </p>
              <p className="text-[#faf6f0]/75 leading-relaxed">{item.desc}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
