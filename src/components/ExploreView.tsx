import React from 'react';
import { ArrowLeft, ArrowRight } from 'lucide-react';
import type { EventSummary } from '../types.ts';

interface ExploreViewProps {
  events: EventSummary[];
  loading: boolean;
  error?: string | null;
  onRetry?: () => void;
  onBack: () => void;
  onOpenEvent: (eventId: number) => void;
}

export const ExploreView: React.FC<ExploreViewProps> = ({
  events,
  loading,
  error,
  onRetry,
  onBack,
  onOpenEvent,
}) => (
  <div className="relative min-h-[calc(100vh-4rem)] bg-[#0d0608]">
    <div
      aria-hidden="true"
      className="pointer-events-none absolute inset-x-0 top-0 h-[420px]"
      style={{
        background:
          'radial-gradient(60% 100% at 50% 0%, rgba(78,10,23,0.5), transparent)',
      }}
    />
    <div className="relative mx-auto w-full max-w-3xl px-6 pb-32 pt-12 sm:pt-20">
      <button
        type="button"
        onClick={onBack}
        className="inline-flex items-center gap-2 text-[11px] tracking-[0.28em] uppercase text-[#faf6f0]/60 hover:text-[#edd2ab] cursor-pointer"
      >
        <ArrowLeft className="h-3.5 w-3.5" /> Home
      </button>

      <p className="mt-14 text-[11px] font-mono tracking-[0.4em] text-[#cf9f5d]">
        EXPLORE EVENTS
      </p>
      <h1 className="mt-5 font-display text-5xl sm:text-6xl leading-[1.05] tracking-tight">
        What is open right now.
      </h1>

      <div className="mt-14 border-t border-[#cf9f5d]/20" data-testid="explore-list">
        {error ? (
          <div role="alert" className="py-10 space-y-4"><p className="text-[#edd2ab]">{error}</p><button type="button" className="auv-btn auv-btn-secondary" onClick={onRetry}>Try again</button></div>
        ) : loading && events.length === 0 ? (
          <div role="status" aria-label="Loading events" className="py-8 space-y-5"><div className="auv-skeleton h-8 w-2/3" /><div className="auv-skeleton h-4 w-1/2" /><div className="auv-skeleton h-8 w-3/4" /></div>
        ) : events.length === 0 ? (
          <p className="py-8 text-[#faf6f0]/60">
            No public events yet. Be the first to organise one.
          </p>
        ) : (
          <ul>
            {events.map((ev) => (
              <li key={ev.id} className="border-b border-[#cf9f5d]/15">
                <button
                  type="button"
                  onClick={() => onOpenEvent(ev.id)}
                  className="group flex w-full items-start justify-between gap-6 py-7 text-left cursor-pointer"
                >
                  <span>
                    <span className="block font-display text-2xl sm:text-3xl text-[#faf6f0] group-hover:text-[#edd2ab] transition-colors">
                      {ev.title}
                    </span>
                    <span className="mt-2 block text-sm text-[#faf6f0]/60">
                      {ev.subtitle}
                    </span>
                    <span className="mt-2 block text-xs text-[#faf6f0]/45">
                      {ev.location} · {ev.datesLabel}
                    </span>
                  </span>
                  <ArrowRight className="mt-2 h-5 w-5 shrink-0 text-[#cf9f5d] opacity-60 group-hover:opacity-100 transition-opacity" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  </div>
);
