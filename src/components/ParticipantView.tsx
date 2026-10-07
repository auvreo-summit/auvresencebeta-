import React, { useState, useEffect, useRef } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import {
  ArrowRight,
  Check,
  Copy,
  ExternalLink,
  Play,
  ArrowUpRight,
  Volume2,
} from 'lucide-react';
import type {
  EventFullContext,
  EventSummary,
  UserProfile,
} from '../types.ts';
import type { ActionArchitectureTrace } from './ActionXRayModal.tsx';

export type ParticipantSubTab =
  | 'UPDATES'
  | 'TODAY'
  | 'SCHEDULE'
  | 'CREDENTIAL'
  | 'DISCOVERY'
  | 'RESOURCES';

interface ParticipantViewProps {
  user: UserProfile | null;
  authToken: string | null;
  authMode?: 'PARTICIPANT_A' | 'ORGANISER_B' | 'FIREBASE';
  events: EventSummary[];
  selectedEventId: number;
  onSelectEvent: (id: number) => void;
  context: EventFullContext | null;
  onRefreshContext: () => Promise<void>;
  onOpenAskAuvresence: (question?: string) => void;
  onOpenVenueMap: () => void;
  onOpenVerificationPreview: (token: string) => void;
  onSignInAsParticipant: () => Promise<string | null>;
  onSwitchToOrganiser: () => void;
  onResetGoldenPath: (mode: 'STEP_1_UNAPPLIED' | 'ACCEPTED_READY') => Promise<void>;
  externalSubTab?: ParticipantSubTab;
  onSubTabChange?: (tab: ParticipantSubTab) => void;
  onRecordActionTrace?: (trace: ActionArchitectureTrace) => void;
  onOpenLastXRay?: () => void;
  ttsConfigured?: boolean;
}

export const ParticipantView: React.FC<ParticipantViewProps> = ({
  user,
  authToken,
  events,
  selectedEventId,
  onSelectEvent,
  context,
  onRefreshContext,
  onOpenAskAuvresence,
  onOpenVenueMap,
  onOpenVerificationPreview,
  onSignInAsParticipant,
  externalSubTab,
  onSubTabChange,
  onRecordActionTrace,
  ttsConfigured,
}) => {
  const [subTab, setSubTab] = useState<ParticipantSubTab>(
    externalSubTab || 'TODAY'
  );

  useEffect(() => {
    if (externalSubTab) {
      setSubTab(externalSubTab);
    }
  }, [externalSubTab]);

  const handleSelectSubTab = (tab: ParticipantSubTab) => {
    setSubTab(tab);
    if (onSubTabChange) onSubTabChange(tab);
  };

  // Live clock for Participant Opening
  const [nowTime, setNowTime] = useState(() => new Date());
  useEffect(() => {
    const timer = setInterval(() => setNowTime(new Date()), 30000);
    return () => clearInterval(timer);
  }, []);

  // Application form state
  const [showApplyForm, setShowApplyForm] = useState(false);
  const [applicantName, setApplicantName] = useState(
    user?.displayName || 'Guest'
  );
  const [institution, setInstitution] = useState('');
  // Empty = "use the first organiser-defined category, or plain Participant".
  const [category, setCategory] = useState('');
  const [statement, setStatement] = useState('');
  const [submittingApp, setSubmittingApp] = useState(false);
  const [appMessage, setAppMessage] = useState<{
    type: 'success' | 'error';
    text: string;
  } | null>(null);

  // Brief Me state
  const [briefingLoading, setBriefingLoading] = useState(false);
  const [briefingText, setBriefingText] = useState<string | null>(null);
  const [briefingError, setBriefingError] = useState<string | null>(null);
  const [speakingBriefing, setSpeakingBriefing] = useState(false);

  // Copy verification link state
  const [copiedToken, setCopiedToken] = useState(false);

  // Subtle 3D tilt for ceremonial credential
  const [cardTilt, setCardTilt] = useState({ rotateX: 0, rotateY: 0 });
  const credCardRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (user?.displayName) {
      setApplicantName(user.displayName);
    }
  }, [user]);

  if (!context) {
    return (
      <div className="max-w-[1160px] mx-auto px-6 py-20 space-y-10">
        <div className="h-4 w-32 bg-[#1a0206] animate-pulse" />
        <div className="h-12 w-80 bg-[#1a0206] animate-pulse" />
        <div className="grid md:grid-cols-2 gap-12 pt-8 border-t border-[#cf9f5d]/15">
          <div className="h-44 bg-[#1a0206] animate-pulse" />
          <div className="h-44 bg-[#1a0206] animate-pulse" />
        </div>
      </div>
    );
  }

  const myApp = context.myApplication;
  const myCred = context.myCredential;
  const pulse = context.pulse;
  const happeningNow = pulse.happeningNow;
  const upNext = pulse.upNext;

  // A session counts as changed purely from persisted state (the organiser's
  // change note) — never from any place or session name.
  const updatedSession = context.sessions.find((s) =>
    Boolean(s.lastUpdatedNote)
  );
  const hasVenueMove = Boolean(updatedSession);

  const getGreeting = () => {
    const h = Number(new Intl.DateTimeFormat('en-GB', { timeZone: context.event.timezone || 'UTC', hour: 'numeric', hourCycle: 'h23' }).format(nowTime));
    const prefix =
      h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
    const first = (
      myApp?.applicantName ||
      user?.displayName ||
      'THERE'
    )
      .split(' ')[0];
    return `${prefix}, ${first}.`;
  };

  const formattedDate = nowTime
    .toLocaleDateString('en-GB', {
      timeZone: context.event.timezone || 'UTC',
      day: '2-digit',
      month: 'long',
    })
    .toUpperCase();
  const formattedClock = nowTime.toLocaleTimeString([], {
    timeZone: context.event.timezone || 'UTC',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });

  const handleSubmitApplication = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmittingApp(true);
    setAppMessage(null);

    try {
      let tokenToUse = authToken;
      if (!tokenToUse) {
        tokenToUse = await onSignInAsParticipant();
      }
      if (!tokenToUse) {
        throw new Error('Please sign in to submit your application.');
      }

      const res = await fetch(`/api/events/${selectedEventId}/apply`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${tokenToUse}`,
        },
        body: JSON.stringify({
          applicantName,
          institution,
          category:
            category || context.event.categories[0] || 'Participant',
          statement,
        }),
      });

      const json = await res.json();
      if (!res.ok) {
        throw new Error(json.error || 'Could not submit application.');
      }

      await onRefreshContext();
      setShowApplyForm(false);
      setAppMessage({
        type: 'success',
        text: 'Your application has been received and is now under review.',
      });

      if (onRecordActionTrace) {
        onRecordActionTrace({
          id: `apply-${Date.now()}`,
          title: 'Participant Application Submitted',
          subtitle: `${applicantName} · ${context.event.title}`,
          timestamp: new Date().toLocaleTimeString(),
          steps: [
            {
              layer: 'PARTICIPANT ACTION',
              detail: `POST /api/events/${selectedEventId}/apply`,
            },
            {
              layer: 'IDENTITY & VALIDATION',
              detail: `Verified participant identity and validated application fields.`,
            },
            {
              layer: 'DATABASE PERSISTENCE',
              detail: `Saved application #${json.application?.id || ''} with status UNDER_REVIEW.`,
            },
            {
              layer: 'CONNECTED STATE',
              detail: `Visible immediately in Organiser Studio Applications queue.`,
            },
          ],
        });
      }
    } catch (err: any) {
      setAppMessage({
        type: 'error',
        text: err.message || 'Could not submit application.',
      });
    } finally {
      setSubmittingApp(false);
    }
  };

  const handleBriefMe = async () => {
    setBriefingLoading(true);
    setBriefingError(null);
    try {
      let tokenToUse = authToken;
      if (!tokenToUse) {
        tokenToUse = await onSignInAsParticipant();
      }
      if (!tokenToUse) {
        throw new Error('Sign in required.');
      }

      const res = await fetch('/api/ai/brief-me', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${tokenToUse}`,
        },
        body: JSON.stringify({ eventId: selectedEventId }),
      });

      const json = await res.json();
      if (!res.ok) {
        throw new Error(
          json.error ||
            'Auvresence is temporarily unavailable. Your event information is still accessible.'
        );
      }

      setBriefingText(json.briefing);

      // If voice TTS is configured, speak the briefing naturally
      if (ttsConfigured && json.briefing) {
        try {
          setSpeakingBriefing(true);
          const ttsRes = await fetch('/api/ai/tts', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${tokenToUse}`,
            },
            body: JSON.stringify({ text: json.briefing }),
          });
          if (ttsRes.ok) {
            const ttsJson = await ttsRes.json();
            if (ttsJson.audioBase64) {
              const audio = new Audio(
                `data:${ttsJson.audioMimeType || 'audio/wav'};base64,${ttsJson.audioBase64}`
              );
              audio.onended = () => setSpeakingBriefing(false);
              audio.onerror = () => setSpeakingBriefing(false);
              await audio.play();
            } else {
              setSpeakingBriefing(false);
            }
          } else {
            setSpeakingBriefing(false);
          }
        } catch {
          setSpeakingBriefing(false);
        }
      }
    } catch (err: any) {
      setBriefingError(
        err.message ||
          'Auvresence is temporarily unavailable. Your event information is still accessible.'
      );
    } finally {
      setBriefingLoading(false);
    }
  };

  const verificationUrl = myCred
    ? `${window.location.origin}/verify/${myCred.verificationToken}`
    : '';

  const handleCopyVerificationUrl = () => {
    if (!verificationUrl) return;
    navigator.clipboard.writeText(verificationUrl).then(() => {
      setCopiedToken(true);
      setTimeout(() => setCopiedToken(false), 2000);
    }).catch(() => { setBriefingError('Couldn’t copy the link. Open the verification page to share it.'); });
  };

  return (
    <div className="max-w-[1160px] mx-auto px-6 py-10 lg:py-14 space-y-12 pb-28 md:pb-16">
      {/* SUBTLE PARTICIPANT COMPANION NAVIGATION */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-[#cf9f5d]/15 pb-4">
        <div role="navigation" aria-label="Participant navigation" className="flex max-w-full items-center gap-6 overflow-x-auto text-xs tracking-widest uppercase">
          {[
            { id: 'TODAY', label: 'Today' },
            { id: 'SCHEDULE', label: 'My Day' },
            { id: 'UPDATES', label: 'Updates' },
            { id: 'CREDENTIAL', label: 'Credential' },
            { id: 'DISCOVERY', label: 'Event' },
          ].map((t) => (
            <button
              key={t.id}
              onClick={() => handleSelectSubTab(t.id as ParticipantSubTab)}
              aria-current={subTab === t.id ? 'page' : undefined}
              className={`min-h-11 py-1.5 transition-colors cursor-pointer whitespace-nowrap ${
                subTab === t.id
                  ? 'text-[#cf9f5d] border-b border-[#cf9f5d] font-semibold'
                  : 'text-[#faf6f0]/60 hover:text-[#faf6f0]'
              }`}
            >
              {t.label}
            </button>
          ))}
          <button
            onClick={onOpenVenueMap}
            className="min-h-11 py-1.5 text-[#faf6f0]/60 hover:text-[#faf6f0] transition-colors cursor-pointer whitespace-nowrap"
          >
            Venue
          </button>
        </div>

        {subTab !== 'TODAY' && <div className="text-xs font-mono text-[#edd2ab]/70 tabular-nums">
          {formattedDate} · {formattedClock}
        </div>}
      </div>

      {subTab === 'UPDATES' && (
        <section className="max-w-3xl">
          <p className="text-xs font-mono tracking-[.25em] text-[#cf9f5d]">EVENT BULLETIN</p>
          <h1 className="font-display text-5xl mt-5 mb-10">What needs your attention.</h1>
          {context.announcements.length === 0 ? <p className="text-[#edd2ab]">Nothing needs your attention right now.</p> : (
            <div className="divide-y divide-[#edd2ab]/15 border-t border-[#edd2ab]/15">
              {[...context.announcements].sort((a,b) => ({URGENT:0,IMPORTANT:1,STANDARD:2}[a.priority] - {URGENT:0,IMPORTANT:1,STANDARD:2}[b.priority]) || (Date.parse(b.publishedAt || '') || 0) - (Date.parse(a.publishedAt || '') || 0)).map(update => (
                <article key={update.id} className="py-7">
                  <div className="flex flex-wrap gap-3 text-xs font-mono text-[#cf9f5d] mb-3"><span>{update.priority}</span><span>{(update.announcementType || 'GENERAL').replaceAll('_',' ')}</span>{update.publishedAt && <time dateTime={update.publishedAt}>{new Date(update.publishedAt).toLocaleString([], {timeZone: context.event.timezone || 'UTC', month:'short',day:'numeric',hour:'2-digit',minute:'2-digit'})}</time>}</div>
                  <h2 className="font-display text-3xl">{update.title}</h2>
                  <p className="mt-3 text-sm leading-relaxed text-[#faf6f0]/75 whitespace-pre-line">{update.body}</p>
                  {update.attachedVenueName && <p className="mt-4 text-xs text-[#edd2ab]">Related place · {update.attachedVenueName}</p>}
                </article>
              ))}
            </div>
          )}
        </section>
      )}
      {/* =================================================================== */}
      {/* VIEW 01: TODAY (THE LIVING EVENT COMPANION)                         */}
      {/* =================================================================== */}
      {subTab === 'TODAY' && (
        <div className="space-y-16">
          {/* PARTICIPANT OPENING */}
          <section className="space-y-4">
            <p className="text-xs font-mono tracking-[0.22em] text-[#cf9f5d] tabular-nums">
              {formattedDate} · {formattedClock}
            </p>
            <h1 className="text-4xl sm:text-5xl lg:text-6xl font-display font-normal text-[#faf6f0] tracking-tight leading-[1.06]">
              {getGreeting()}
            </h1>
            <p className="text-lg font-display italic text-[#edd2ab]/85">
              {myApp?.status === 'ACCEPTED'
                ? "You're here."
                : myApp?.status === 'UNDER_REVIEW'
                ? 'Your application is under review.'
                : context.event.title}
            </p>
          </section>

          {/* LIVING EVENT STATE: HAPPENING NOW / UP NEXT / LATEST */}
          <section className="grid lg:grid-cols-12 gap-12 pt-8 border-t border-[#cf9f5d]/20 items-start">
            {/* HAPPENING NOW (5 Cols) */}
            <div className="lg:col-span-5 space-y-4">
              <div className="flex items-center gap-2 text-xs font-mono tracking-widest text-emerald-300">
                <span className="w-2 h-2 rounded-full bg-emerald-400 inline-block" />
                <span>HAPPENING NOW</span>
              </div>

              {happeningNow ? (
                <div className="space-y-3">
                  <h2 className="text-3xl sm:text-4xl font-display font-normal text-[#faf6f0] leading-tight">
                    {happeningNow.title}
                  </h2>
                  <p className="text-base text-[#edd2ab]">
                    {happeningNow.venueName}
                  </p>
                  <p className="text-sm font-mono text-[#faf6f0]/65 tabular-nums">
                    {happeningNow.startTime} – {happeningNow.endTime}
                  </p>
                </div>
              ) : (
                <p className="text-lg font-display text-[#faf6f0]/60">
                  No session currently in progress.
                </p>
              )}
            </div>

            {/* UP NEXT (4 Cols) */}
            <div className="lg:col-span-4 space-y-4 lg:border-l lg:border-[#cf9f5d]/15 lg:pl-10">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-mono tracking-widest text-[#cf9f5d]">
                  UP NEXT
                </span>
                {upNext?.lastUpdatedNote && (
                  <span className="text-[11px] font-mono tracking-widest text-[#cf9f5d] font-semibold">
                    UPDATED
                  </span>
                )}
              </div>

              {upNext ? (
                <div className="space-y-3">
                  <h2 className="text-3xl sm:text-4xl font-display font-normal text-[#faf6f0] leading-tight">
                    {upNext.title}
                  </h2>

                  <div className="space-y-1">
                    <p className="text-sm font-mono text-[#faf6f0]/75 tabular-nums">
                      {upNext.startTime}
                    </p>
                    <div className="flex flex-wrap items-baseline gap-2.5">
                      <span className="text-xl font-mono font-semibold text-[#edd2ab] tracking-wide uppercase">
                        {upNext.venueName ?? 'Place to be announced'}
                      </span>
                      {upNext.lastUpdatedNote && (
                        <span className="text-xs font-mono text-[#cf9f5d]/80 normal-case tracking-normal">
                          {upNext.lastUpdatedNote}
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="pt-2">
                    <button
                      type="button"
                      onClick={onOpenVenueMap}
                      className="text-xs font-medium text-[#cf9f5d] hover:text-[#edd2ab] inline-flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
                    >
                      View venue
                      <ArrowRight className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ) : (
                <p className="text-lg font-display text-[#faf6f0]/60">
                  All scheduled sessions complete.
                </p>
              )}
            </div>

            {/* LATEST (3 Cols) */}
            <div className="lg:col-span-3 space-y-4 lg:border-l lg:border-[#cf9f5d]/15 lg:pl-10">
              <span className="text-xs font-mono tracking-widest text-[#edd2ab]/70 block">
                LATEST
              </span>

              {hasVenueMove ? (
                <div className="space-y-2">
                  <p className="text-lg font-display text-[#faf6f0]">
                    Workshop venue changed
                  </p>
                  <p className="text-base font-mono text-[#cf9f5d] tabular-nums">
                    302 → 305
                  </p>
                  <p className="text-xs text-[#faf6f0]/60 leading-relaxed">
                    {updatedSession?.title} is now in {updatedSession?.venueName}{' '}
                    ({updatedSession?.venueFloor}).
                  </p>
                </div>
              ) : context.announcements[0] ? (
                <div className="space-y-2">
                  <p className="text-lg font-display text-[#faf6f0]">
                    {context.announcements[0].title}
                  </p>
                  <p className="text-xs text-[#faf6f0]/65 leading-relaxed line-clamp-3">
                    {context.announcements[0].body}
                  </p>
                </div>
              ) : (
                <p className="text-sm text-[#faf6f0]/55">
                  Schedule running as planned.
                </p>
              )}
            </div>
          </section>

          {/* AUVRESENCE BRIEF */}
          <section className="pt-10 border-t border-[#cf9f5d]/20 grid lg:grid-cols-12 gap-8 items-start">
            <div className="lg:col-span-8 space-y-4">
              <p className="text-xs font-mono tracking-widest text-[#cf9f5d] uppercase">
                AUVRESENCE BRIEF
              </p>

              {briefingText ? (
                <div className="space-y-3 max-w-2xl">
                  <p className="text-lg sm:text-xl font-display text-[#faf6f0] leading-relaxed whitespace-pre-line">
                    {briefingText}
                  </p>
                  {speakingBriefing && (
                    <p className="text-xs font-mono text-[#cf9f5d] inline-flex items-center gap-2">
                      <Volume2 className="w-3.5 h-3.5 animate-pulse" />
                      SPEAKING
                    </p>
                  )}
                </div>
              ) : briefingError ? (
                <div className="space-y-2 max-w-xl">
                  <p className="text-base font-display text-[#edd2ab]">
                    Auvresence is temporarily unavailable.
                  </p>
                  <p className="text-xs text-[#faf6f0]/70">
                    Your event information is still accessible.
                  </p>
                </div>
              ) : (
                <div className="space-y-2 max-w-2xl">
                  <p className="text-xl sm:text-2xl font-display text-[#faf6f0] leading-relaxed">
                    You&apos;re on schedule.{' '}
                    {upNext
                      ? `Your next moment begins at ${upNext.startTime}${upNext.venueName ? ` in ${upNext.venueName}` : ' · location to be announced'}.`
                      : 'Explore your day below.'}{' '}
                    {hasVenueMove
                      ? 'One venue change was made since your previous event state.'
                      : ''}
                  </p>
                </div>
              )}
            </div>

            <div className="lg:col-span-4 flex lg:justify-end items-center gap-4">
              <button
                type="button"
                onClick={handleBriefMe}
                disabled={briefingLoading}
                className="px-6 py-3 text-xs font-semibold tracking-wider bg-[#1a0206] border border-[#cf9f5d]/45 text-[#edd2ab] hover:bg-[#24040a] hover:border-[#cf9f5d] transition-colors inline-flex items-center gap-2.5 cursor-pointer whitespace-nowrap disabled:opacity-50"
              >
                <Play className="w-3.5 h-3.5 fill-current text-[#cf9f5d]" />
                {briefingLoading ? 'Briefing...' : 'Brief me'}
              </button>

              <button
                type="button"
                onClick={() => onOpenAskAuvresence()}
                className="px-5 py-3 text-xs font-semibold tracking-wider bg-[#cf9f5d] text-[#0d0608] hover:bg-[#edd2ab] transition-colors inline-flex items-center gap-2 cursor-pointer whitespace-nowrap"
              >
                <ArrowUpRight className="w-3.5 h-3.5" />
                Ask Auvresence
              </button>
            </div>
          </section>

          {/* CONTEXTUAL CREDENTIAL OR APPLICATION FOOTNOTE */}
          <section className="pt-10 border-t border-[#cf9f5d]/15 flex flex-col sm:flex-row sm:items-center justify-between gap-6">
            {myCred && myCred.status === 'ACTIVE' ? (
              <>
                <div className="space-y-1">
                  <p className="text-xs font-mono tracking-widest text-[#cf9f5d]">
                    CREDENTIAL ACTIVE
                  </p>
                  <p className="text-lg font-display text-[#faf6f0]">
                    {myApp?.applicantName || user?.displayName} ·{' '}
                    <span className="font-mono text-sm text-[#edd2ab]">
                      {myCred.participantCode}
                    </span>
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => handleSelectSubTab('CREDENTIAL')}
                  className="px-6 py-3 text-xs font-semibold tracking-wider border border-[#cf9f5d]/45 text-[#edd2ab] hover:bg-[#1a0206] transition-colors inline-flex items-center gap-2 cursor-pointer whitespace-nowrap self-start sm:self-auto"
                >
                  Open Credential
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              </>
            ) : myApp ? (
              <>
                <div className="space-y-1">
                  <p className="text-xs font-mono tracking-widest text-[#cf9f5d]">
                    APPLICATION STATUS · {myApp.status}
                  </p>
                  <p className="text-base text-[#faf6f0]/80">
                    Submitted for {context.event.title}. Your credential will
                    activate automatically upon acceptance.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => handleSelectSubTab('DISCOVERY')}
                  className="px-5 py-2.5 text-xs border border-[#cf9f5d]/35 text-[#edd2ab] hover:bg-[#1a0206] transition-colors cursor-pointer whitespace-nowrap"
                >
                  View Application
                </button>
              </>
            ) : (
              <>
                <div className="space-y-1">
                  <p className="text-xs font-mono tracking-widest text-[#cf9f5d]">
                    APPLICATIONS OPEN
                  </p>
                  <p className="text-lg font-display text-[#faf6f0]">
                    Join {context.event.title}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    handleSelectSubTab('DISCOVERY');
                    setShowApplyForm(true);
                  }}
                  className="px-6 py-3 text-xs font-semibold tracking-wider bg-[#cf9f5d] text-[#0d0608] hover:bg-[#edd2ab] transition-colors inline-flex items-center gap-2 cursor-pointer whitespace-nowrap"
                >
                  Apply Now
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              </>
            )}
          </section>
        </div>
      )}

      {/* =================================================================== */}
      {/* VIEW 02: MY DAY (EDITORIAL SCHEDULE TIMELINE)                       */}
      {/* =================================================================== */}
      {subTab === 'SCHEDULE' && (
        <div className="space-y-12">
          <div className="space-y-2">
            <p className="text-xs font-mono tracking-widest text-[#cf9f5d] uppercase">
              MY DAY
            </p>
            <h1 className="text-4xl sm:text-5xl font-display font-normal text-[#faf6f0]">
              {context.event.datesLabel}
            </h1>
          </div>

          <div className="border-t border-[#cf9f5d]/20 divide-y divide-[#cf9f5d]/15">
            {context.sessions.map((session) => {
              const isPast = session.status === 'COMPLETED';
              const isNow = session.status === 'HAPPENING_NOW';
              const isChanged = Boolean(session.lastUpdatedNote);

              return (
                <div
                  key={session.id}
                  className={`py-8 grid md:grid-cols-12 gap-6 items-baseline transition-opacity ${
                    isPast ? 'opacity-50' : 'opacity-100'
                  }`}
                >
                  {/* Time Column */}
                  <div className="md:col-span-3 flex items-center gap-3">
                    <span className="text-xl sm:text-2xl font-mono text-[#faf6f0] tabular-nums">
                      {session.startTime}
                    </span>
                    <span className="text-xs font-mono text-[#faf6f0]/45 tabular-nums">
                      – {session.endTime}
                    </span>
                  </div>

                  {/* Session Title & Venue Column */}
                  <div className="md:col-span-6 space-y-2">
                    <h2 className="text-2xl sm:text-3xl font-display font-normal text-[#faf6f0]">
                      {session.title}
                    </h2>
                    <div className="flex flex-wrap items-center gap-2 text-xs font-mono tracking-wider uppercase text-[#edd2ab]">
                      <span>{session.venueName ?? 'Place to be announced'}</span>
                      {session.venueFloor && (
                        <>
                          <span aria-hidden="true">·</span>
                          <span className="text-[#faf6f0]/60">
                            {session.venueFloor}
                          </span>
                        </>
                      )}
                      {session.lastUpdatedNote && (
                        <span className="normal-case tracking-normal text-[#cf9f5d]/80">
                          · {session.lastUpdatedNote}
                        </span>
                      )}
                    </div>
                    {session.speaker && (
                      <p className="text-xs text-[#faf6f0]/65 pt-1">
                        {session.speaker}
                      </p>
                    )}
                  </div>

                  {/* State Indicator Column */}
                  <div className="md:col-span-3 flex md:justify-end items-center gap-4">
                    {isPast && (
                      <span className="text-xs font-mono text-[#edd2ab]/70 inline-flex items-center gap-1.5">
                        <Check className="w-3.5 h-3.5" />
                        COMPLETED
                      </span>
                    )}
                    {isNow && (
                      <span className="text-xs font-mono text-emerald-300 font-semibold inline-flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full bg-emerald-400" />
                        NOW
                      </span>
                    )}
                    {isChanged && !isPast && (
                      <span className="text-xs font-mono text-[#cf9f5d] font-semibold tracking-widest">
                        UPDATED
                      </span>
                    )}
                    <button
                      type="button"
                      onClick={onOpenVenueMap}
                      className="text-xs text-[#edd2ab]/70 hover:text-[#faf6f0] underline cursor-pointer whitespace-nowrap"
                    >
                      Venue
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* =================================================================== */}
      {/* VIEW 03: CEREMONIAL DIGITAL CREDENTIAL                              */}
      {/* =================================================================== */}
      {subTab === 'CREDENTIAL' && (
        <div className="py-6 flex flex-col items-center justify-center space-y-10">
          {myCred ? (
            <>
              <div
                ref={credCardRef}
                onMouseMove={(e) => {
                  if (!credCardRef.current) return;
                  const rect = credCardRef.current.getBoundingClientRect();
                  const x = (e.clientX - rect.left) / rect.width - 0.5;
                  const y = (e.clientY - rect.top) / rect.height - 0.5;
                  setCardTilt({ rotateX: -y * 7, rotateY: x * 7 });
                }}
                onMouseLeave={() => setCardTilt({ rotateX: 0, rotateY: 0 })}
                style={{
                  transform: `perspective(1100px) rotateX(${cardTilt.rotateX}deg) rotateY(${cardTilt.rotateY}deg)`,
                }}
                className="w-full max-w-md border border-[#cf9f5d]/55 bg-gradient-to-b from-[#1a0206] via-[#130307] to-[#0d0608] p-8 sm:p-10 space-y-8 transition-transform duration-200 ease-out shadow-2xl"
              >
                {/* Top Brand Mark & Status */}
                <div className="flex items-center justify-between border-b border-[#cf9f5d]/25 pb-5">
                  <span className="text-xs font-mono tracking-[0.28em] text-[#cf9f5d]">
                    AUVRESENCE
                  </span>
                  <span
                    className={`text-xs font-mono tracking-widest ${
                      myCred.status === 'ACTIVE'
                        ? 'text-emerald-300'
                        : 'text-red-300'
                    }`}
                  >
                    {myCred.status}
                  </span>
                </div>

                {/* Identity */}
                <div className="space-y-2">
                  <h1 className="text-3xl sm:text-4xl font-display font-normal text-[#faf6f0] tracking-wide uppercase">
                    {myApp?.applicantName || user?.displayName}
                  </h1>
                  <p className="text-xs font-mono tracking-widest text-[#edd2ab] uppercase">
                    {myCred.roleCategory || 'PARTICIPANT'}
                  </p>
                </div>

                {/* Event Title */}
                <div className="space-y-1 pt-2 border-t border-[#cf9f5d]/15">
                  <p className="text-sm font-display text-[#faf6f0]/90">
                    {context.event.title}
                  </p>
                  <p className="text-xs font-mono text-[#faf6f0]/55 tabular-nums">
                    {context.event.location} · {context.event.datesLabel}
                  </p>
                </div>

                {/* Scannable QR Code */}
                <div className="pt-2 flex flex-col items-center justify-center space-y-4">
                  <div className="bg-[#faf6f0] p-5">
                    <QRCodeSVG
                      value={verificationUrl}
                      size={168}
                      bgColor="#faf6f0"
                      fgColor="#0d0608"
                      level="M"
                    />
                  </div>
                  <p className="text-xs font-mono tracking-widest text-[#cf9f5d] tabular-nums">
                    {myCred.participantCode}
                  </p>
                </div>
              </div>

              {/* Minimal Verification Actions */}
              <div className="flex flex-wrap items-center justify-center gap-4">
                <button
                  type="button"
                  onClick={() =>
                    onOpenVerificationPreview(myCred.verificationToken)
                  }
                  className="px-5 py-2.5 text-xs font-semibold bg-[#cf9f5d] text-[#0d0608] hover:bg-[#edd2ab] transition-colors inline-flex items-center gap-2 cursor-pointer whitespace-nowrap"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                  Verify Credential
                </button>

                <button
                  type="button"
                  onClick={handleCopyVerificationUrl}
                  className="px-4 py-2.5 text-xs border border-[#cf9f5d]/35 text-[#edd2ab] hover:bg-[#1a0206] transition-colors inline-flex items-center gap-2 cursor-pointer whitespace-nowrap"
                >
                  {copiedToken ? (
                    <>
                      <Check className="w-3.5 h-3.5 text-emerald-300" />
                      Copied Link
                    </>
                  ) : (
                    <>
                      <Copy className="w-3.5 h-3.5" />
                      Copy Verification Link
                    </>
                  )}
                </button>
              </div>
            </>
          ) : (
            <div className="max-w-md w-full border border-[#cf9f5d]/25 bg-[#1a0206] p-10 text-center space-y-5">
              <p className="text-xs font-mono tracking-widest text-[#cf9f5d]">
                CREDENTIAL
              </p>
              <h2 className="text-2xl font-display text-[#faf6f0]">
                {myApp?.status === 'UNDER_REVIEW'
                  ? 'Application Under Review'
                  : 'No Active Credential Yet'}
              </h2>
              <p className="text-xs text-[#faf6f0]/70 leading-relaxed">
                {myApp?.status === 'UNDER_REVIEW'
                  ? 'Your credential will appear here automatically as soon as your application is accepted.'
                  : 'Apply to the event to receive your digital credential upon acceptance.'}
              </p>
              {!myApp && (
                <button
                  type="button"
                  onClick={() => {
                    handleSelectSubTab('DISCOVERY');
                    setShowApplyForm(true);
                  }}
                  className="px-6 py-3 text-xs font-semibold bg-[#cf9f5d] text-[#0d0608] hover:bg-[#edd2ab] transition-colors cursor-pointer"
                >
                  Apply to Event
                </button>
              )}
            </div>
          )}
        </div>
      )}

      {/* =================================================================== */}
      {/* VIEW 04: EVENT DETAIL & APPLICATION                                 */}
      {/* =================================================================== */}
      {subTab === 'DISCOVERY' && (
        <div className="space-y-14">
          {/* Event Switcher if multiple events exist */}
          {events.length > 1 && (
            <div className="flex flex-wrap items-center gap-3">
              {events.map((ev) => (
                <button
                  key={ev.id}
                  onClick={() => onSelectEvent(ev.id)}
                  className={`px-4 py-2 text-xs transition-colors cursor-pointer ${
                    ev.id === selectedEventId
                      ? 'bg-[#cf9f5d] text-[#0d0608] font-semibold'
                      : 'border border-[#cf9f5d]/30 text-[#edd2ab]'
                  }`}
                >
                  {ev.title}
                </button>
              ))}
            </div>
          )}

          {/* Editorial Event Hero */}
          <section className="space-y-6">
            <div className="flex flex-wrap items-center gap-3 text-xs font-mono tracking-widest text-[#cf9f5d]">
              <span>{context.event.location.toUpperCase()}</span>
              <span aria-hidden="true">·</span>
              <span>{context.event.datesLabel.toUpperCase()}</span>
              {myApp && (
                <>
                  <span aria-hidden="true">·</span>
                  <span className="text-[#edd2ab]">{myApp.status}</span>
                </>
              )}
            </div>

            <h1 className="text-4xl sm:text-5xl lg:text-6xl font-display font-normal text-[#faf6f0] leading-[1.08] max-w-4xl">
              {context.event.title}
            </h1>

            <p className="text-lg sm:text-xl font-display italic text-[#edd2ab] max-w-2xl">
              {context.event.subtitle}
            </p>

            <p className="text-sm text-[#faf6f0]/75 max-w-2xl leading-relaxed">
              {context.event.description}
            </p>

            {/* Single Contextual Action */}
            <div className="pt-4">
              {myApp?.status === 'ACCEPTED' ? (
                <div className="flex flex-wrap items-center gap-4">
                  <button
                    type="button"
                    onClick={() => handleSelectSubTab('TODAY')}
                    className="px-6 py-3 text-xs font-semibold tracking-wider bg-[#cf9f5d] text-[#0d0608] hover:bg-[#edd2ab] transition-colors inline-flex items-center gap-2 cursor-pointer whitespace-nowrap"
                  >
                    Open Participant Space
                    <ArrowRight className="w-4 h-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => handleSelectSubTab('CREDENTIAL')}
                    className="px-5 py-3 text-xs border border-[#cf9f5d]/40 text-[#edd2ab] hover:bg-[#1a0206] transition-colors cursor-pointer whitespace-nowrap"
                  >
                    View Credential
                  </button>
                </div>
              ) : myApp ? (
                <div className="border-t border-[#cf9f5d]/20 pt-6 space-y-2 max-w-xl">
                  <p className="text-xs font-mono tracking-widest text-[#cf9f5d]">
                    APPLICATION STATUS · {myApp.status}
                  </p>
                  <p className="text-base text-[#faf6f0]">
                    Submitted by {myApp.applicantName} ({myApp.institution}) for{' '}
                    {myApp.category}.
                  </p>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setShowApplyForm(true)}
                  className="px-7 py-3.5 text-xs font-semibold tracking-widest bg-[#cf9f5d] text-[#0d0608] hover:bg-[#edd2ab] transition-colors inline-flex items-center gap-2.5 cursor-pointer whitespace-nowrap"
                >
                  APPLY
                  <ArrowRight className="w-4 h-4" />
                </button>
              )}
            </div>
          </section>

          {appMessage && (
            <div className="border border-[#cf9f5d]/40 bg-[#1a0206] p-6 text-sm text-[#faf6f0]">
              {appMessage.text}
            </div>
          )}

          {/* Application Form */}
          {(!myApp || showApplyForm) && !myApp && (
            <section className="pt-10 border-t border-[#cf9f5d]/20 max-w-2xl space-y-6">
              <div className="space-y-1">
                <p className="text-xs font-mono tracking-widest text-[#cf9f5d]">
                  PARTICIPANT APPLICATION
                </p>
                <h2 className="text-2xl font-display text-[#faf6f0]">
                  Apply for {context.event.title}
                </h2>
              </div>

              <form onSubmit={handleSubmitApplication} className="space-y-5">
                <div className="grid sm:grid-cols-2 gap-5">
                  <div className="space-y-1.5">
                    <label className="block text-xs text-[#edd2ab]">
                      Full Name
                    </label>
                    <input
                      type="text"
                      required
                      value={applicantName}
                      onChange={(e) => setApplicantName(e.target.value)}
                      className="w-full px-4 py-3 text-sm bg-[#1a0206] border border-[#cf9f5d]/35 text-[#faf6f0] focus:outline-none focus:border-[#cf9f5d]"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="block text-xs text-[#edd2ab]">
                      Institution / Organisation
                    </label>
                    <input
                      type="text"
                      required
                      value={institution}
                      onChange={(e) => setInstitution(e.target.value)}
                      className="w-full px-4 py-3 text-sm bg-[#1a0206] border border-[#cf9f5d]/35 text-[#faf6f0] focus:outline-none focus:border-[#cf9f5d]"
                    />
                  </div>
                </div>

                {context.event.categories.length > 0 && (
                <div className="space-y-1.5">
                  <label className="block text-xs text-[#edd2ab]">
                    How would you like to take part?
                  </label>
                  <select
                    value={category || context.event.categories[0]}
                    onChange={(e) => setCategory(e.target.value)}
                    className="w-full px-4 py-3 text-sm bg-[#1a0206] border border-[#cf9f5d]/35 text-[#faf6f0] focus:outline-none focus:border-[#cf9f5d]"
                  >
                    {context.event.categories.map((cat) => (
                      <option key={cat} value={cat}>
                        {cat}
                      </option>
                    ))}
                  </select>
                </div>
                )}

                <div className="space-y-1.5">
                  <label className="block text-xs text-[#edd2ab]">
                    Why would you like to take part? (min. 15 characters)
                  </label>
                  <textarea
                    rows={3}
                    required
                    value={statement}
                    onChange={(e) => setStatement(e.target.value)}
                    className="w-full px-4 py-3 text-sm bg-[#1a0206] border border-[#cf9f5d]/35 text-[#faf6f0] focus:outline-none focus:border-[#cf9f5d]"
                  />
                </div>

                <button
                  type="submit"
                  disabled={submittingApp}
                  className="px-6 py-3 text-xs font-semibold tracking-wider bg-[#cf9f5d] text-[#0d0608] hover:bg-[#edd2ab] transition-colors cursor-pointer disabled:opacity-50"
                >
                  {submittingApp
                    ? 'Submitting Application...'
                    : 'Submit Application'}
                </button>
              </form>
            </section>
          )}
        </div>
      )}
    </div>
  );
};
