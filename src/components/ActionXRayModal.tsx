import React, { useEffect, useState } from 'react';
import { X, ArrowDown, CheckCircle2, Layers } from 'lucide-react';

export interface ActionArchitectureTrace {
  id: string;
  title: string;
  subtitle: string;
  timestamp: string;
  steps: Array<{
    layer: string;
    detail: string;
  }>;
}

interface ActionXRayModalProps {
  trace: ActionArchitectureTrace | null;
  onClose: () => void;
}

export const ActionXRayModal: React.FC<ActionXRayModalProps> = ({
  trace,
  onClose,
}) => {
  const [activeStepIndex, setActiveStepIndex] = useState(0);

  useEffect(() => {
    if (!trace) return;
    setActiveStepIndex(0);
    const interval = setInterval(() => {
      setActiveStepIndex((prev) => {
        if (prev < trace.steps.length - 1) return prev + 1;
        clearInterval(interval);
        return prev;
      });
    }, 140);
    return () => clearInterval(interval);
  }, [trace]);

  if (!trace) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-xs p-4">
      <div className="w-full max-w-xl bg-[#080203] border border-[#E6C887]/45 shadow-2xl overflow-hidden">
        <div className="p-6 bg-[#120608] border-b border-[#E6C887]/25 flex items-start justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2 text-xs font-mono text-[#E6C887]">
              <Layers className="w-3.5 h-3.5" />
              <span>ACTION ARCHITECTURE · SYSTEM X-RAY</span>
            </div>
            <h2 className="text-2xl font-display font-semibold text-[#FCFAF7]">
              {trace.title}
            </h2>
            <p className="text-xs text-[#E6C887]/80">{trace.subtitle}</p>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-[#FCFAF7]/70 hover:text-[#FCFAF7] border border-[#E6C887]/25 cursor-pointer"
            aria-label="Close System X-Ray"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-6 space-y-2 max-h-[68vh] overflow-y-auto">
          {trace.steps.map((step, idx) => {
            const isLit = idx <= activeStepIndex;
            return (
              <React.Fragment key={step.layer}>
                <div
                  className={`p-3.5 border transition-all duration-150 flex items-center justify-between gap-4 ${
                    isLit
                      ? 'bg-[#17090C] border-[#E6C887]/50 text-[#FCFAF7]'
                      : 'bg-[#080203] border-white/10 text-[#FCFAF7]/40'
                  }`}
                >
                  <div>
                    <p className="text-xs font-mono font-semibold text-[#E6C887]">
                      0{idx + 1} · {step.layer}
                    </p>
                    <p className="text-xs text-[#FCFAF7]/85 mt-0.5">
                      {step.detail}
                    </p>
                  </div>
                  <CheckCircle2
                    className={`w-4 h-4 shrink-0 transition-opacity ${
                      isLit ? 'text-emerald-400 opacity-100' : 'opacity-20'
                    }`}
                  />
                </div>
                {idx < trace.steps.length - 1 && (
                  <div className="flex justify-center py-0.5">
                    <ArrowDown
                      className={`w-3.5 h-3.5 ${
                        isLit ? 'text-[#E6C887]' : 'text-white/15'
                      }`}
                    />
                  </div>
                )}
              </React.Fragment>
            );
          })}
        </div>

        <div className="px-6 py-4 bg-[#120608] border-t border-[#E6C887]/20 flex items-center justify-between gap-4 text-[11px] text-[#FCFAF7]/65">
          <span>
            Explanatory architecture trace of the completed server operation (
            {trace.timestamp}).
          </span>
          <button
            onClick={onClose}
            className="px-4 py-1.5 text-xs font-semibold bg-[#E6C887] text-[#080203] hover:bg-[#E6C887] transition-colors cursor-pointer whitespace-nowrap"
          >
            Close X-Ray
          </button>
        </div>
      </div>
    </div>
  );
};
