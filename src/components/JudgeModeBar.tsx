import React from 'react';
import { RotateCcw, ArrowRight, Layers, Shield, X } from 'lucide-react';

export interface SystemHealthStatus {
  server: boolean;
  database?: string;
  databaseReady?: boolean;
  aiConfigured: boolean;
  voiceConfigured?: boolean;
  ttsConfigured?: boolean;
  visionConfigured?: boolean;
  showcaseMode: boolean;
  debugToolsEnabled?: boolean;
  demoIdentitiesEnabled?: boolean;
}

export const DEMO_STEPS = [
  { id: 1, code: '01 APPLY', description: 'Participant submits application' },
  { id: 2, code: '02 REVIEW', description: 'Organiser opens Applications' },
  { id: 3, code: '03 ACCEPT', description: 'Organiser accepts participant' },
  { id: 4, code: '04 CREDENTIAL', description: 'Participant QR activates' },
  { id: 5, code: '05 LIVE UPDATE', description: 'Organiser moves Lab 302 → 305' },
  { id: 6, code: '06 AI', description: 'Ask Auvresence: Where do I go next?' },
  { id: 7, code: '07 SECURITY', description: 'Run live security checks' },
];

interface JudgeModeBarProps {
  isOpen: boolean;
  onClose: () => void;
  health: SystemHealthStatus | null;
  activeStep: number;
  onSelectStep: (stepId: number) => void;
  onNextStep: () => void;
  onStartTwoMinDemo: () => void;
  onResetGoldenPath: () => void;
  activeRole: 'PARTICIPANT' | 'ORGANISER' | undefined;
  onSwitchAccount: (account: 'PARTICIPANT_A' | 'ORGANISER_B') => void;
  onNavigateSurface: (
    surface: 'EXPERIENCE' | 'ORGANISE' | 'LIVE' | 'SECURITY' | 'ARCHITECTURE'
  ) => void;
  hasLastTrace: boolean;
  onOpenLastXRay: () => void;
}

export const JudgeModeBar: React.FC<JudgeModeBarProps> = ({
  isOpen,
  onClose,
  health,
  activeStep,
  onSelectStep,
  onNextStep,
  onStartTwoMinDemo,
  onResetGoldenPath,
  activeRole,
  onSwitchAccount,
  onNavigateSurface,
  hasLastTrace,
  onOpenLastXRay,
}) => {
  if (!isOpen) return null;
  if (!health?.debugToolsEnabled) {
    return null;
  }

  const dbOk = Boolean(health?.databaseReady || health?.database === 'available');

  return (
    <div className="bg-[#1a0206] border-b border-[#cf9f5d]/35 px-6 py-3 text-xs">
      <div className="max-w-[1280px] mx-auto space-y-3">
        {/* Top Row: Console Surfaces (DEMO RESET / PARTICIPANT / ORGANISER / LIVE / SECURITY / SYSTEM X-RAY) */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#cf9f5d]/15 pb-2.5">
          <div className="flex flex-wrap items-center gap-3 font-mono text-[11px]">
            <span className="tracking-widest text-[#cf9f5d] font-semibold">
              TECHNOVATE · JUDGE CONSOLE
            </span>
            <span aria-hidden="true" className="text-white/25">
              ·
            </span>
            <span className={dbOk ? 'text-emerald-300' : 'text-amber-300'}>
              DB {dbOk ? '✓' : '…'}
            </span>
            <span aria-hidden="true" className="text-white/25">
              ·
            </span>
            <span
              className={
                health?.aiConfigured ? 'text-emerald-300' : 'text-[#edd2ab]/75'
              }
            >
              {health?.aiConfigured ? 'AI ✓' : 'AI UNAVAILABLE'}
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-2 font-mono text-[11px]">
            <button
              type="button"
              onClick={onResetGoldenPath}
              className="px-2.5 py-1 border border-[#cf9f5d]/30 text-[#edd2ab] hover:bg-[#24040a] transition-colors inline-flex items-center gap-1 cursor-pointer whitespace-nowrap"
            >
              <RotateCcw className="w-3 h-3" />
              DEMO RESET
            </button>

            <button
              type="button"
              onClick={() => {
                onSwitchAccount('PARTICIPANT_A');
                onNavigateSurface('EXPERIENCE');
              }}
              className={`px-2.5 py-1 transition-colors cursor-pointer whitespace-nowrap ${
                activeRole === 'PARTICIPANT'
                  ? 'bg-[#cf9f5d] text-[#0d0608] font-semibold'
                  : 'border border-[#cf9f5d]/30 text-[#edd2ab] hover:bg-[#24040a]'
              }`}
            >
              PARTICIPANT
            </button>

            <button
              type="button"
              onClick={() => {
                onSwitchAccount('ORGANISER_B');
                onNavigateSurface('ORGANISE');
              }}
              className={`px-2.5 py-1 transition-colors cursor-pointer whitespace-nowrap ${
                activeRole === 'ORGANISER'
                  ? 'bg-[#cf9f5d] text-[#0d0608] font-semibold'
                  : 'border border-[#cf9f5d]/30 text-[#edd2ab] hover:bg-[#24040a]'
              }`}
            >
              ORGANISER
            </button>

            <button
              type="button"
              onClick={() => onNavigateSurface('LIVE')}
              className="px-2.5 py-1 border border-[#cf9f5d]/30 text-[#edd2ab] hover:bg-[#24040a] transition-colors cursor-pointer whitespace-nowrap"
            >
              LIVE
            </button>

            <button
              type="button"
              onClick={() => onNavigateSurface('SECURITY')}
              className="px-2.5 py-1 border border-[#cf9f5d]/30 text-[#edd2ab] hover:bg-[#24040a] transition-colors inline-flex items-center gap-1 cursor-pointer whitespace-nowrap"
            >
              <Shield className="w-3 h-3" />
              SECURITY
            </button>

            <button
              type="button"
              onClick={() => onNavigateSurface('ARCHITECTURE')}
              className="px-2.5 py-1 border border-[#cf9f5d]/30 text-[#edd2ab] hover:bg-[#24040a] transition-colors inline-flex items-center gap-1 cursor-pointer whitespace-nowrap"
            >
              <Layers className="w-3 h-3" />
              SYSTEM X-RAY
            </button>

            {hasLastTrace && (
              <button
                type="button"
                onClick={onOpenLastXRay}
                className="px-2.5 py-1 bg-emerald-950/80 border border-emerald-500/40 text-emerald-300 hover:bg-emerald-900/80 transition-colors cursor-pointer whitespace-nowrap"
              >
                LAST TRACE
              </button>
            )}

            <button
              type="button"
              onClick={onClose}
              className="p-1 text-[#faf6f0]/60 hover:text-[#faf6f0] cursor-pointer"
              aria-label="Close Judge Mode"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* Bottom Row: 7-Step Golden Path Rail */}
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-1">
            {DEMO_STEPS.map((s) => {
              const isCurrent = activeStep === s.id;
              return (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => onSelectStep(s.id)}
                  title={s.description}
                  className={`px-2 py-1 font-mono text-[11px] transition-colors cursor-pointer whitespace-nowrap ${
                    isCurrent
                      ? 'bg-[#cf9f5d] text-[#0d0608] font-semibold'
                      : 'bg-[#0d0608]/70 text-[#edd2ab]/75 hover:text-[#faf6f0] border border-[#cf9f5d]/20'
                  }`}
                >
                  {s.code}
                </button>
              );
            })}
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onStartTwoMinDemo}
              className="px-2.5 py-1 font-mono text-[11px] bg-[#24040a] border border-[#cf9f5d]/40 text-[#edd2ab] hover:bg-[#4e0a17] transition-colors cursor-pointer whitespace-nowrap"
            >
              START 2-MIN DEMO
            </button>

            <button
              type="button"
              onClick={onNextStep}
              className="px-2.5 py-1 font-mono text-[11px] bg-[#cf9f5d] text-[#0d0608] font-semibold hover:bg-[#edd2ab] transition-colors inline-flex items-center gap-1 cursor-pointer whitespace-nowrap"
            >
              NEXT STEP
              <ArrowRight className="w-3 h-3" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
