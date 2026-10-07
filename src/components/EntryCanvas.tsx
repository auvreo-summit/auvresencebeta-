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
    <div className="auv-entrance relative min-h-[100svh] overflow-hidden bg-[#0d0608] text-[#faf6f0]">
      {/* Ambient wine light — slow, quiet */}
      <div aria-hidden="true" className="pointer-events-none absolute inset-0">
        <div
          className="absolute left-1/2 top-[30%] h-[720px] w-[1100px] -translate-x-1/2 -translate-y-1/2 rounded-full opacity-70"
          style={{
            background:
              'radial-gradient(closest-side, rgba(78,10,23,0.75), rgba(36,4,10,0.35) 55%, transparent)',
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
            stroke="#cf9f5d"
            strokeWidth="0.75"
          />
          <circle cx="760" cy="400" r="3" fill="#edd2ab" />
        </svg>
      </div>

      {/* Top edge — the only navigation on the entrance */}
      <header className="relative z-20 flex items-center justify-between px-6 sm:px-10 py-6">
        <span className="font-display text-sm tracking-[0.34em] text-[#edd2ab]">
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
            className="min-h-11 text-xs tracking-[0.28em] uppercase text-[#edd2ab] border-b border-[#cf9f5d]/60 pb-1 hover:text-[#faf6f0] hover:border-[#faf6f0] transition-colors disabled:opacity-50 cursor-pointer"
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
              <p className="mt-6 font-display italic text-2xl sm:text-3xl text-[#edd2ab]/85">
                What are we doing today?
              </p>
            </>
          ) : (
            <>
              <p className="text-[11px] font-mono tracking-[0.4em] text-[#cf9f5d]">
                WELCOME TO YOUR NEXT EXPERIENCE
              </p>
              <h1 className="mt-8 font-display text-5xl sm:text-6xl lg:text-7xl leading-[1.04] tracking-tight">
                What are we doing today?
              </h1>
            </>
          )}
        </div>

        {/* Conversational composer — IS the interface here */}
        <form onSubmit={submit} className="auv-rise-2 mt-12 w-full">
          <label htmlFor="auv-ask" className="sr-only">
            Ask Auvresence
          </label>
          <div className="flex items-center border border-[#cf9f5d]/40 bg-[#1a0206]/85 pl-6 pr-2 py-2 transition-colors focus-within:border-[#cf9f5d]">
            <input
              id="auv-ask"
              data-testid="ask-input"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              placeholder="Ask Auvresence…"
              autoComplete="off"
              maxLength={500}
              className="min-w-0 flex-1 bg-transparent py-3 text-base sm:text-lg text-[#faf6f0] placeholder:text-[#faf6f0]/60 outline-none"
            />
            <button
              type="submit"
              aria-label="Send"
              aria-busy={asking}
              disabled={asking || !value.trim()}
              className="flex shrink-0 h-11 w-11 items-center justify-center bg-[#cf9f5d] text-[#0d0608] transition-colors hover:bg-[#edd2ab] disabled:bg-[#4e0a17] disabled:text-[#faf6f0]/30 cursor-pointer"
            >
              <ArrowUp className="h-5 w-5" />
            </button>
          </div>
        </form>

        {aiConfigured === false && <p className="mt-4 text-xs text-[#faf6f0]/55 text-center">Event information and navigation are available. Free-form intelligence is currently unavailable.</p>}

        {/* The response happens here, in the canvas — never in a drawer */}
        <div data-testid="canvas-reply" aria-live="polite" className="w-full">
          {asking && <p role="status" className="mt-8 font-display italic text-xl text-[#edd2ab]">Auvresence is thinking…</p>}
          {messages.map((message, index) => <div key={index} className="auv-rise mt-8 w-full border-t border-[#cf9f5d]/20 pt-6">
            <p className="text-sm text-[#faf6f0]/60 break-words">{message.question}</p>
            <p role={message.error ? 'alert' : undefined} className="mt-4 font-display text-xl sm:text-2xl text-[#edd2ab] whitespace-pre-wrap break-words">{message.answer || message.error}</p>
            {!!message.actions?.length && <div className="mt-6 flex flex-wrap gap-3">{message.actions.map((action, i) => <button key={i} type="button" data-testid={action.type === 'CREATE_EVENT' ? 'reply-start-creating' : undefined} onClick={() => openAction(action)} className="inline-flex items-center gap-2 border border-[#cf9f5d]/50 px-5 py-3 text-xs text-[#edd2ab] hover:bg-[#24040a] cursor-pointer">{action.label}<ArrowRight className="h-4 w-4" /></button>)}</div>}
          </div>)}
        </div>

        {/* Deterministic doors — always present, never behind the AI */}
        <div className="auv-rise-3 mt-12 flex flex-wrap items-center justify-center gap-x-10 gap-y-4">
          <button
            type="button"
            data-testid="explore-events"
            onClick={onExplore}
            className="min-h-11 text-xs tracking-[0.26em] uppercase text-[#faf6f0]/80 hover:text-[#edd2ab] transition-colors cursor-pointer"
          >
            Explore Events
          </button>
          {signedIn && <button type="button" className="min-h-11 text-xs tracking-[.2em] text-[#faf6f0]/70 hover:text-[#edd2ab]" onClick={() => document.getElementById('your-journeys')?.scrollIntoView({ behavior: 'auto', block: 'start' })}>Continue my journey</button>}
          <span aria-hidden="true" className="hidden sm:block h-4 w-px bg-[#cf9f5d]/35" />
          <button
            type="button"
            data-testid="organise-event"
            onClick={() => (signedIn ? onOrganise() : onSignIn('ORGANISE'))}
            className="min-h-11 inline-flex items-center gap-2 text-xs tracking-[0.26em] uppercase text-[#edd2ab] hover:text-[#faf6f0] transition-colors cursor-pointer"
          >
            <Plus className="h-3.5 w-3.5" />
            Organise an Event
          </button>
        </div>

        {authError && (
          <p
            role="alert"
            data-testid="auth-error"
            className="mt-8 max-w-md text-center text-sm text-[#edd2ab]/80"
          >
            {authError}
          </p>
        )}

        {!signedIn && (
          <button
            type="button"
            onClick={() => onSignIn()}
            disabled={signingIn}
            className="auv-rise-3 mt-14 text-[11px] tracking-[0.34em] uppercase text-[#faf6f0]/55 hover:text-[#edd2ab] transition-colors disabled:opacity-50 cursor-pointer"
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
            <h2 className="font-mono text-[11px] tracking-[0.4em] text-[#cf9f5d]">
              YOUR JOURNEYS
            </h2>

            {journeysError ? (
              <div className="mt-8 text-sm text-[#faf6f0]/70">
                {journeysError}{' '}
                <button
                  type="button"
                  onClick={onRetryJourneys}
                  className="underline decoration-[#cf9f5d]/60 underline-offset-4 text-[#edd2ab] cursor-pointer"
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
    <h3 className="font-display text-2xl text-[#faf6f0]">{title}</h3>
    <div className="mt-4 border-t border-[#cf9f5d]/20">
      {loading ? (
        <p className="py-6 text-sm text-[#faf6f0]/45">Loading…</p>
      ) : rows.length === 0 ? (
        <div className="py-6 text-sm text-[#faf6f0]/55">
          <p>{empty}</p>
          <button
            type="button"
            onClick={emptyAction.onClick}
            className="mt-3 text-xs tracking-[0.22em] uppercase text-[#edd2ab] border-b border-[#cf9f5d]/50 pb-0.5 hover:text-[#faf6f0] cursor-pointer"
          >
            {emptyAction.label}
          </button>
        </div>
      ) : (
        <ul>
          {rows.map((r) => (
            <li key={r.id} className="border-b border-[#cf9f5d]/15">
              <button
                type="button"
                data-testid={`journey-${r.id}`}
                onClick={r.onOpen}
                className="group flex w-full items-start justify-between gap-4 py-5 text-left cursor-pointer"
              >
                <span>
                  <span className="block font-display text-xl text-[#faf6f0] group-hover:text-[#edd2ab] transition-colors">
                    {r.title}
                  </span>
                  <span className="mt-1 block text-xs text-[#faf6f0]/55">
                    {r.meta}
                  </span>
                </span>
                <span className="mt-1 shrink-0 font-mono text-[10px] tracking-[0.2em] text-[#cf9f5d]">
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
