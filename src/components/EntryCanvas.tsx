import React, { useEffect, useRef, useState } from 'react';
import { ArrowUp, ArrowRight, Plus } from 'lucide-react';
import type { PlatformAction, ConversationTurn } from '../lib/conversation.ts';
import type { UserJourneysData, UserProfile } from '../types.ts';
import { ProfileMenu } from './ProfileMenu.tsx';

/**
 * The Auvresence entrance.
 *
 * Signed out: one conversational canvas (no dashboard, no sidebar, no drawer).
 * Signed in:  the same canvas evolves into the user's Home.
 *
 * Conversation here is the interface, not an assistant bolted on the side.
 * It only ever *routes* — every destination is also reachable through a plain
 * deterministic button, so the conversation never gates navigation.
 */

interface EntryCanvasProps {
  user: UserProfile | null;
  getToken: () => Promise<string | null>;
  aiConfigured?: boolean;
  photoURL?: string | null;
  journeys: UserJourneysData | null;
  journeysLoading: boolean;
  journeysError: string | null;
  signingIn: boolean;
  authError: string | null;
  onSignIn: (intent?: 'ORGANISE') => void;
  onSignOut: () => void;
  onOrganise: (prefill?: { description?: string }) => void;
  onExplore: () => void;
  onOpenParticipating: (eventId: number) => void;
  onOpenOrganising: (eventId: number) => void;
  onRetryJourneys: () => void;
}

const greeting = (name?: string) => {
  const h = new Date().getHours();
  const part = h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
  return name ? `${part}, ${name.split(' ')[0]}.` : null;
};

export const EntryCanvas: React.FC<EntryCanvasProps> = ({
  user,
  getToken,
  aiConfigured,
  photoURL,
  journeys,
  journeysLoading,
  journeysError,
  signingIn,
  authError,
  onSignIn,
  onSignOut,
  onOrganise,
  onExplore,
  onOpenParticipating,
  onOpenOrganising,
  onRetryJourneys,
}) => {
  const [value, setValue] = useState('');
  const [messages, setMessages] = useState<Array<{ question: string; answer?: string; error?: string; actions?: PlatformAction[] }>>([]);
  const [asking, setAsking] = useState(false);
  const signedIn = Boolean(user);
  const generation = useRef(0);
  useEffect(() => { generation.current++; setMessages([]); setAsking(false); }, [user?.id]);

  const openAction = (action: PlatformAction) => {
    if (action.type === 'EXPLORE_EVENTS') return onExplore();
    if (action.type === 'CREATE_EVENT') return signedIn ? onOrganise() : onSignIn('ORGANISE');
    if (action.type === 'OPEN_STUDIO' && action.eventId) return onOpenOrganising(action.eventId);
    if (action.eventId) return onOpenParticipating(action.eventId);
  };
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const question = value.trim();
    if (!question || asking) return;
    const requestGeneration = generation.current;
    setAsking(true);
    setValue('');
    const history: ConversationTurn[] = messages.flatMap(m => m.answer ? [{ role: 'user' as const, content: m.question }, { role: 'assistant' as const, content: m.answer.slice(0, 1500) }] : []).slice(-6);
    try {
      const token = await getToken();
      const response = await fetch('/api/ai/ask', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({ question, history }),
        signal: AbortSignal.timeout(45000),
      });
      const body = await response.json();
      if (requestGeneration !== generation.current) return;
      setMessages(previous => [...previous, response.ok ? { question, answer: body.answer, actions: body.actions } : { question, error: body.error || 'Auvresence intelligence is temporarily unavailable. Your tools remain accessible.' }]);
    } catch {
      if (requestGeneration !== generation.current) return;
      setMessages(previous => [...previous, { question, error: 'Auvresence intelligence is temporarily unavailable. Your tools remain accessible.' }]);
    } finally { if (requestGeneration === generation.current) setAsking(false); }
  };

  const hello = greeting(user?.displayName);

  return (
    <div className="auv-entrance auv-atmosphere relative min-h-[100svh] overflow-hidden bg-[#080203] text-[#FCFAF7]">
      {/* Ambient wine light — slow, quiet */}
      <div aria-hidden="true" className="pointer-events-none absolute inset-0">
        <div
          className="absolute left-1/2 top-[30%] h-[720px] w-[1100px] -translate-x-1/2 -translate-y-1/2 rounded-full opacity-70"
          style={{
            background:
              'radial-gradient(closest-side, rgba(196,18,36,0.20), rgba(196,18,36,0.06) 55%, transparent)',
          }}
        />
        <div
          className="absolute inset-x-0 bottom-0 h-1/3"
          style={{
            background:
              'linear-gradient(to top, rgba(13,6,8,1), rgba(13,6,8,0))',
          }}
        />
        <svg
          className="absolute inset-0 h-full w-full opacity-[0.22]"
          viewBox="0 0 1440 900"
          preserveAspectRatio="xMidYMid slice"
          fill="none"
        >
          <path
            d="M -40 700 C 300 640, 520 330, 760 400 C 1000 470, 1180 260, 1500 220"
            stroke="#E6C887"
            strokeWidth="0.75"
          />
          <circle cx="760" cy="400" r="3" fill="#E6C887" />
        </svg>
      </div>

      {/* Top edge — the only navigation on the entrance */}
      <header className="relative z-20 flex items-center justify-between px-6 sm:px-10 py-6">
        <span className="auv-wordmark font-display text-sm tracking-[0.34em] text-[#E6C887]">
          AUVRESENCE
        </span>
        {user ? (
          <ProfileMenu
            user={user}
            photoURL={photoURL}
            onGoHome={() => setMessages([])}
            onSignOut={onSignOut}
          />
        ) : (
          <button
            type="button"
            data-testid="sign-in"
            onClick={() => onSignIn()}
            disabled={signingIn}
            className="min-h-11 text-xs tracking-[0.28em] uppercase text-[#E6C887] border-b border-[#E6C887]/60 pb-1 hover:text-[#FCFAF7] hover:border-[#FCFAF7] transition-colors disabled:opacity-50 cursor-pointer"
          >
            {signingIn ? 'Signing in…' : 'Sign in'}
          </button>
        )}
      </header>

      <main className="relative z-10 mx-auto flex w-full max-w-3xl flex-col items-center px-6 pb-24 pt-[9vh] sm:pt-[12vh]">
        <div className="auv-rise text-center">
          {hello ? (
            <>
              <h1
                data-testid="home-greeting"
                className="font-display text-5xl sm:text-6xl lg:text-7xl leading-[1.04] tracking-tight"
              >
                {hello}
              </h1>
              <p className="mt-6 font-editorial italic text-2xl sm:text-3xl text-[#E6C887]/85">
                What are we doing today?
              </p>
            </>
          ) : (
            <>
              <p className="text-[11px] font-mono tracking-[0.4em] text-[#E6C887]">
                YOUR WORLD, IN CONVERSATION
              </p>
              <h1 className="mt-8 font-display text-5xl sm:text-6xl lg:text-7xl leading-[1.04] tracking-tight">
                What are we doing today?
              </h1>
            </>
          )}
        </div>

        {/* Conversational composer — IS the interface here */}
        <form onSubmit={submit} className="auv-entrance-composer auv-rise-2 mt-12 w-full">
          <label htmlFor="auv-ask" className="sr-only">
            Ask Auvresence
          </label>
          <div className="flex items-center border border-[#E6C887]/40 bg-[#120608]/85 pl-6 pr-2 py-2 transition-colors focus-within:border-[#E6C887]">
            <input
              id="auv-ask"
              data-testid="ask-input"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              placeholder="Ask Auvresence…"
              autoComplete="off"
              maxLength={500}
              className="min-w-0 flex-1 bg-transparent py-3 text-base sm:text-lg text-[#FCFAF7] placeholder:text-[#FCFAF7]/60 outline-none"
            />
            <button
              type="submit"
              aria-label="Send"
              aria-busy={asking}
              disabled={asking || !value.trim()}
              className="auv-send flex shrink-0 h-11 w-11 items-center justify-center bg-[#E6C887] text-[#080203] transition-colors hover:bg-[#E6C887] disabled:bg-[#C41224] disabled:text-[#FCFAF7]/30 cursor-pointer"
            >
              <ArrowUp className="h-5 w-5" />
            </button>
          </div>
        </form>

        {aiConfigured === false && <p className="mt-4 text-xs text-[#FCFAF7]/55 text-center">Event information and navigation are available. Free-form intelligence is currently unavailable.</p>}

        {/* The response happens here, in the canvas — never in a drawer */}
        <div data-testid="canvas-reply" aria-live="polite" className="w-full">
          {asking && <p role="status" className="mt-8 font-display italic text-xl text-[#E6C887]">Auvresence is thinking…</p>}
          {messages.map((message, index) => <div key={index} className="auv-rise mt-8 w-full border-t border-[#E6C887]/20 pt-6">
            <p className="text-sm text-[#FCFAF7]/60 break-words">{message.question}</p>
            <p role={message.error ? 'alert' : undefined} className="mt-4 font-sans text-base sm:text-lg leading-relaxed text-[#FCFAF7] whitespace-pre-wrap break-words">{message.answer || message.error}</p>
            {!!message.actions?.length && <div className="mt-6 flex flex-wrap gap-3">{message.actions.map((action, i) => <button key={i} type="button" data-testid={action.type === 'CREATE_EVENT' ? 'reply-start-creating' : undefined} onClick={() => openAction(action)} className="inline-flex items-center gap-2 border border-[#E6C887]/50 px-5 py-3 text-xs text-[#E6C887] hover:bg-[#17090C] cursor-pointer">{action.label}<ArrowRight className="h-4 w-4" /></button>)}</div>}
          </div>)}
        </div>

        {/* Deterministic doors — always present, never behind the AI */}
        <div className="auv-entrance-doors auv-rise-3 mt-12 flex flex-wrap items-center justify-center gap-x-10 gap-y-4">
          <button
            type="button"
            data-testid="explore-events"
            onClick={onExplore}
            className="min-h-11 text-xs tracking-[0.26em] uppercase text-[#FCFAF7]/80 hover:text-[#E6C887] transition-colors cursor-pointer"
          >
            Explore Events
          </button>
          {signedIn && <button type="button" className="min-h-11 text-xs tracking-[.2em] text-[#FCFAF7]/70 hover:text-[#E6C887]" onClick={() => document.getElementById('your-journeys')?.scrollIntoView({ behavior: 'auto', block: 'start' })}>Continue my journey</button>}
          <span aria-hidden="true" className="hidden sm:block h-4 w-px bg-[#E6C887]/35" />
          <button
            type="button"
            data-testid="organise-event"
            onClick={() => (signedIn ? onOrganise() : onSignIn('ORGANISE'))}
            className="min-h-11 inline-flex items-center gap-2 text-xs tracking-[0.26em] uppercase text-[#E6C887] hover:text-[#FCFAF7] transition-colors cursor-pointer"
          >
            <Plus className="h-3.5 w-3.5" />
            Organise an Event
          </button>
        </div>

        {authError && (
          <p
            role="alert"
            data-testid="auth-error"
            className="mt-8 max-w-md text-center text-sm text-[#E6C887]/80"
          >
            {authError}
          </p>
        )}

        {!signedIn && (
          <button
            type="button"
            onClick={() => onSignIn()}
            disabled={signingIn}
            className="auv-rise-3 mt-14 text-[11px] tracking-[0.34em] uppercase text-[#FCFAF7]/55 hover:text-[#E6C887] transition-colors disabled:opacity-50 cursor-pointer"
          >
            {signingIn ? 'Signing in…' : 'Sign in'}
          </button>
        )}

        {/* YOUR JOURNEYS — only once signed in; not a dashboard */}
        {signedIn && (
          <section
            id="your-journeys"
            data-testid="your-journeys"
            className="mt-24 w-full"
          >
            <h2 className="font-mono text-[11px] tracking-[0.4em] text-[#E6C887]">
              YOUR JOURNEYS
            </h2>

            {journeysError ? (
              <div className="mt-8 text-sm text-[#FCFAF7]/70">
                {journeysError}{' '}
                <button
                  type="button"
                  onClick={onRetryJourneys}
                  className="underline decoration-[#E6C887]/60 underline-offset-4 text-[#E6C887] cursor-pointer"
                >
                  Try again
                </button>
              </div>
            ) : (
              <div className="mt-8 grid gap-14 sm:grid-cols-2">
                <JourneyColumn
                  title="Participating"
                  testId="journeys-participating"
                  loading={journeysLoading && !journeys}
                  empty="Nothing yet. Events you apply to will appear here."
                  emptyAction={{ label: 'Explore events', onClick: onExplore }}
                  rows={(journeys?.participating ?? []).map((j) => ({
                    id: j.event.id,
                    title: j.event.title,
                    meta: `${j.event.location} · ${j.event.datesLabel}`,
                    badge: j.application.status.replace('_', ' '),
                    onOpen: () => onOpenParticipating(j.event.id),
                  }))}
                />
                <JourneyColumn
                  title="Organising"
                  testId="journeys-organising"
                  loading={journeysLoading && !journeys}
                  empty="You are not organising anything yet."
                  emptyAction={{
                    label: 'Organise an event',
                    onClick: () => onOrganise(),
                  }}
                  rows={(journeys?.organising ?? []).map((ev) => ({
                    id: ev.id,
                    title: ev.title,
                    meta: `${ev.location} · ${ev.datesLabel}`,
                    badge: 'STUDIO',
                    onOpen: () => onOpenOrganising(ev.id),
                  }))}
                />
              </div>
            )}

          </section>
        )}
      </main>
    </div>
  );
};

interface JourneyRow {
  id: number;
  title: string;
  meta: string;
  badge: string;
  onOpen: () => void;
}

const JourneyColumn: React.FC<{
  title: string;
  testId: string;
  loading: boolean;
  empty: string;
  emptyAction: { label: string; onClick: () => void };
  rows: JourneyRow[];
}> = ({ title, testId, loading, empty, emptyAction, rows }) => (
  <div data-testid={testId}>
    <h3 className="font-display text-2xl text-[#FCFAF7]">{title}</h3>
    <div className="mt-4 border-t border-[#E6C887]/20">
      {loading ? (
        <p className="py-6 text-sm text-[#FCFAF7]/45">Loading…</p>
      ) : rows.length === 0 ? (
        <div className="py-6 text-sm text-[#FCFAF7]/55">
          <p>{empty}</p>
          <button
            type="button"
            onClick={emptyAction.onClick}
            className="mt-3 text-xs tracking-[0.22em] uppercase text-[#E6C887] border-b border-[#E6C887]/50 pb-0.5 hover:text-[#FCFAF7] cursor-pointer"
          >
            {emptyAction.label}
          </button>
        </div>
      ) : (
        <ul>
          {rows.map((r) => (
            <li key={r.id} className="border-b border-[#E6C887]/15">
              <button
                type="button"
                data-testid={`journey-${r.id}`}
                onClick={r.onOpen}
                className="group flex w-full items-start justify-between gap-4 py-5 text-left cursor-pointer"
              >
                <span>
                  <span className="block font-display text-xl text-[#FCFAF7] group-hover:text-[#E6C887] transition-colors">
                    {r.title}
                  </span>
                  <span className="mt-1 block text-xs text-[#FCFAF7]/55">
                    {r.meta}
                  </span>
                </span>
                <span className="mt-1 shrink-0 font-mono text-[10px] tracking-[0.2em] text-[#E6C887]">
                  {r.badge}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  </div>
);
