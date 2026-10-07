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
  const [phone, setPhone] = useState('');
  const [customAnswer, setCustomAnswer] = useState('');
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
        <div className="h-4 w-32 bg-[#120608] animate-pulse" />
        <div className="h-12 w-80 bg-[#120608] animate-pulse" />
        <div className="grid md:grid-cols-2 gap-12 pt-8 border-t border-[#E6C887]/15">
          <div className="h-44 bg-[#120608] animate-pulse" />
          <div className="h-44 bg-[#120608] animate-pulse" />
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
          phone: phone || undefined,
          customAnswer: customAnswer || undefined,
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
    <div className="auv-participant max-w-[1280px] mx-auto px-5 sm:px-8 py-10 lg:py-14 space-y-12 pb-28 md:pb-16">
      <section className="auv-event-identity" aria-label="Event identity">
        <div>
          <p className="auv-eyebrow">YOUR EVENT SPACE</p>
          <h2 className="mt-3 text-2xl sm:text-3xl font-display font-medium">{context.event.title}</h2>
          <p className="mt-3 text-sm text-[#B8ADAA]">{context.event.location} · {context.event.datesLabel}</p>
        </div>
        <button type="button" onClick={() => onOpenAskAuvresence()} className="auv-btn auv-btn-primary">Ask Auvresence <ArrowUpRight className="h-4 w-4" /></button>
      </section>
      {/* SUBTLE PARTICIPANT COMPANION NAVIGATION */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-[#E6C887]/15 pb-4">
        <div role="navigation" aria-label="Participant navigation" className="auv-participant-tabs flex max-w-full items-center gap-6 overflow-x-auto text-xs tracking-widest uppercase">
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
                  ? 'text-[#E6C887] border-b border-[#E6C887] font-semibold'
                  : 'text-[#FCFAF7]/60 hover:text-[#FCFAF7]'
              }`}
            >
              {t.label}
            </button>
          ))}
          <button
            onClick={onOpenVenueMap}
            className="min-h-11 py-1.5 text-[#FCFAF7]/60 hover:text-[#FCFAF7] transition-colors cursor-pointer whitespace-nowrap"
          >
            Venue
          </button>
        </div>

        {subTab !== 'TODAY' && <div className="text-xs font-mono text-[#E6C887]/70 tabular-nums">
          {formattedDate} · {formattedClock}
        </div>}
      </div>

      {subTab === 'UPDATES' && (
        <section className="max-w-3xl">
          <p className="text-xs font-mono tracking-[.25em] text-[#E6C887]">EVENT BULLETIN</p>
          <h1 className="font-display text-5xl mt-5 mb-10">What needs your attention.</h1>
          {context.announcements.length === 0 ? <p className="text-[#E6C887]">Nothing needs your attention right now.</p> : (
            <div className="divide-y divide-[#E6C887]/15 border-t border-[#E6C887]/15">
              {[...context.announcements].sort((a,b) => ({URGENT:0,IMPORTANT:1,STANDARD:2}[a.priority] - {URGENT:0,IMPORTANT:1,STANDARD:2}[b.priority]) || (Date.parse(b.publishedAt || '') || 0) - (Date.parse(a.publishedAt || '') || 0)).map(update => (
                <article key={update.id} className="py-7">
                  <div className="flex flex-wrap gap-3 text-xs font-mono text-[#E6C887] mb-3"><span>{update.priority}</span><span>{(update.announcementType || 'GENERAL').replaceAll('_',' ')}</span>{update.publishedAt && <time dateTime={update.publishedAt}>{new Date(update.publishedAt).toLocaleString([], {timeZone: context.event.timezone || 'UTC', month:'short',day:'numeric',hour:'2-digit',minute:'2-digit'})}</time>}</div>
                  <h2 className="font-display text-3xl">{update.title}</h2>
                  <p className="mt-3 text-sm leading-relaxed text-[#FCFAF7]/75 whitespace-pre-line">{update.body}</p>
                  {update.attachedVenueName && <p className="mt-4 text-xs text-[#E6C887]">Related place · {update.attachedVenueName}</p>}
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
            <p className="text-xs font-mono tracking-[0.22em] text-[#E6C887] tabular-nums">
              {formattedDate} · {formattedClock}
            </p>
            <h1 className="text-4xl sm:text-5xl lg:text-6xl font-display font-normal text-[#FCFAF7] tracking-tight leading-[1.06]">
              {getGreeting()}
            </h1>
            <p className="text-lg font-display italic text-[#E6C887]/85">
              {myApp?.status === 'ACCEPTED'
                ? "You're here."
                : myApp?.status === 'UNDER_REVIEW'
                ? 'Your application is under review.'
                : context.event.title}
            </p>
          </section>

          {/* LIVING EVENT STATE: HAPPENING NOW / UP NEXT / LATEST */}
          <section className="auv-live-rail grid lg:grid-cols-12 gap-8 pt-8 border-t border-[#E6C887]/20 items-start">
            {/* HAPPENING NOW (5 Cols) */}
            <div className="lg:col-span-5 space-y-4">
              <div className="flex items-center gap-2 text-xs font-mono tracking-widest text-emerald-300">
                <span className={`w-2 h-2 rounded-full inline-block ${happeningNow ? "bg-emerald-400" : "bg-[#7D706D]"}`} />
                <span>NOW</span>
              </div>

              {happeningNow ? (
                <div className="space-y-3">
                  <h2 className="text-3xl sm:text-4xl font-display font-normal text-[#FCFAF7] leading-tight">
                    {happeningNow.title}
                  </h2>
                  <p className="text-base text-[#E6C887]">
                    {happeningNow.venueName}
                  </p>
                  <p className="text-sm font-mono text-[#FCFAF7]/65 tabular-nums">
                    {happeningNow.startTime} – {happeningNow.endTime}
                  </p>
                </div>
              ) : (
                <p className="text-lg font-display text-[#FCFAF7]/60">
                  No session currently in progress.
                </p>
              )}
            </div>

            {/* UP NEXT (4 Cols) */}
            <div className="lg:col-span-4 space-y-4 lg:border-l lg:border-[#E6C887]/15 lg:pl-10">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-mono tracking-widest text-[#E6C887]">
                  UP NEXT
                </span>
                {upNext?.lastUpdatedNote && (
                  <span className="text-[11px] font-mono tracking-widest text-[#E6C887] font-semibold">
                    UPDATED
                  </span>
                )}
              </div>

              {upNext ? (
                <div className="space-y-3">
                  <h2 className="text-3xl sm:text-4xl font-display font-normal text-[#FCFAF7] leading-tight">
                    {upNext.title}
                  </h2>

                  <div className="space-y-1">
                    <p className="text-sm font-mono text-[#FCFAF7]/75 tabular-nums">
                      {upNext.startTime}
                    </p>
                    <div className="flex flex-wrap items-baseline gap-2.5">
                      <span className="text-xl font-mono font-semibold text-[#E6C887] tracking-wide uppercase">
                        {upNext.venueName ?? 'Place to be announced'}
                      </span>
                      {upNext.lastUpdatedNote && (
                        <span className="text-xs font-mono text-[#E6C887]/80 normal-case tracking-normal">
                          {upNext.lastUpdatedNote}
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="pt-2">
                    <button
                      type="button"
                      onClick={onOpenVenueMap}
                      className="text-xs font-medium text-[#E6C887] hover:text-[#E6C887] inline-flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
                    >
                      View venue
                      <ArrowRight className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ) : (
                <p className="text-lg font-display text-[#FCFAF7]/60">
                  No upcoming session is marked.
                </p>
              )}
            </div>

            {/* LATEST (3 Cols) */}
            <div className="lg:col-span-3 space-y-4 lg:border-l lg:border-[#E6C887]/15 lg:pl-10">
              <span className="text-xs font-mono tracking-widest text-[#E6C887]/70 block">
                WHAT CHANGED
              </span>

              {hasVenueMove ? (
                <div className="space-y-2">
                  <p className="text-lg font-display text-[#FCFAF7]">
                    Session updated
                  </p>
                  <p className="text-base font-mono text-[#E6C887] tabular-nums">
                    {updatedSession?.lastUpdatedNote}
                  </p>
                  <p className="text-xs text-[#FCFAF7]/60 leading-relaxed">
                    {updatedSession?.title} is now in {updatedSession?.venueName}{' '}
                    ({updatedSession?.venueFloor}).
                  </p>
                </div>
              ) : context.announcements[0] ? (
                <div className="space-y-2">
                  <p className="text-lg font-display text-[#FCFAF7]">
                    {context.announcements[0].title}
                  </p>
                  <p className="text-xs text-[#FCFAF7]/65 leading-relaxed line-clamp-3">
                    {context.announcements[0].body}
                  </p>
                </div>
              ) : (
                <p className="text-sm text-[#FCFAF7]/55">
                  No announcements yet.
                </p>
              )}
            </div>
          </section>

          {/* AUVRESENCE BRIEF */}
          <section className="pt-10 border-t border-[#E6C887]/20 grid lg:grid-cols-12 gap-8 items-start">
            <div className="lg:col-span-8 space-y-4">
              <p className="text-xs font-mono tracking-widest text-[#E6C887] uppercase">
                AUVRESENCE BRIEF
              </p>

              {briefingText ? (
                <div className="space-y-3 max-w-2xl">
                  <p className="text-lg sm:text-xl font-display text-[#FCFAF7] leading-relaxed whitespace-pre-line">
                    {briefingText}
                  </p>
                  {speakingBriefing && (
                    <p className="text-xs font-mono text-[#E6C887] inline-flex items-center gap-2">
                      <Volume2 className="w-3.5 h-3.5 animate-pulse" />
                      SPEAKING
                    </p>
                  )}
                </div>
              ) : briefingError ? (
                <div className="space-y-2 max-w-xl">
                  <p className="text-base font-display text-[#E6C887]">
                    Auvresence is temporarily unavailable.
                  </p>
                  <p className="text-xs text-[#FCFAF7]/70">
                    Your event information is still accessible.
                  </p>
                </div>
              ) : (
                <div className="space-y-2 max-w-2xl">
                  <p className="text-xl sm:text-2xl font-display text-[#FCFAF7] leading-relaxed">
                    On your programme.{' '}
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
                className="px-6 py-3 text-xs font-semibold tracking-wider bg-[#120608] border border-[#E6C887]/45 text-[#E6C887] hover:bg-[#17090C] hover:border-[#E6C887] transition-colors inline-flex items-center gap-2.5 cursor-pointer whitespace-nowrap disabled:opacity-50"
              >
                <Play className="w-3.5 h-3.5 fill-current text-[#E6C887]" />
                {briefingLoading ? 'Briefing...' : 'Brief me'}
              </button>

              <button
                type="button"
                onClick={() => onOpenAskAuvresence()}
                className="px-5 py-3 text-xs font-semibold tracking-wider bg-[#E51E2B] text-[#FCFAF7] hover:bg-[#C41224] transition-colors inline-flex items-center gap-2 cursor-pointer whitespace-nowrap"
              >
                <ArrowUpRight className="w-3.5 h-3.5" />
                Ask Auvresence
              </button>
            </div>
          </section>

          {/* CONTEXTUAL CREDENTIAL OR APPLICATION FOOTNOTE */}
          <section className="pt-10 border-t border-[#E6C887]/15 flex flex-col sm:flex-row sm:items-center justify-between gap-6">
            {myCred && myCred.status === 'ACTIVE' ? (
              <>
                <div className="space-y-1">
                  <p className="text-xs font-mono tracking-widest text-[#E6C887]">
                    CREDENTIAL ACTIVE
                  </p>
                  <p className="text-lg font-display text-[#FCFAF7]">
                    {myApp?.applicantName || user?.displayName} ·{' '}
                    <span className="font-mono text-sm text-[#E6C887]">
                      {myCred.participantCode}
                    </span>
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => handleSelectSubTab('CREDENTIAL')}
                  className="px-6 py-3 text-xs font-semibold tracking-wider border border-[#E6C887]/45 text-[#E6C887] hover:bg-[#120608] transition-colors inline-flex items-center gap-2 cursor-pointer whitespace-nowrap self-start sm:self-auto"
                >
                  Open Credential
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              </>
            ) : myApp ? (
              <>
                <div className="space-y-1">
                  <p className="text-xs font-mono tracking-widest text-[#E6C887]">
                    APPLICATION STATUS · {myApp.status}
                  </p>
                  <p className="text-base text-[#FCFAF7]/80">
                    Submitted for {context.event.title}. Your credential will
                    activate automatically upon acceptance.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => handleSelectSubTab('DISCOVERY')}
                  className="px-5 py-2.5 text-xs border border-[#E6C887]/35 text-[#E6C887] hover:bg-[#120608] transition-colors cursor-pointer whitespace-nowrap"
                >
                  View Application
                </button>
              </>
            ) : (
              <>
                <div className="space-y-1">
                  <p className="text-xs font-mono tracking-widest text-[#E6C887]">
                    APPLICATIONS OPEN
                  </p>
                  <p className="text-lg font-display text-[#FCFAF7]">
                    Join {context.event.title}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    handleSelectSubTab('DISCOVERY');
                    setShowApplyForm(true);
                  }}
                  disabled={context.event.applicationStatus !== 'OPEN'}
                  className="px-6 py-3 text-xs font-semibold tracking-wider bg-[#E51E2B] text-[#FCFAF7] hover:bg-[#C41224] transition-colors inline-flex items-center gap-2 cursor-pointer whitespace-nowrap"
                >
                  {context.event.applicationStatus === 'OPEN' ? 'Apply Now' : 'Applications ' + (context.event.applicationStatus || 'OPEN').toLowerCase().replace('_', ' ')}
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
            <p className="text-xs font-mono tracking-widest text-[#E6C887] uppercase">
              MY DAY
            </p>
            <h1 className="text-4xl sm:text-5xl font-display font-normal text-[#FCFAF7]">
              {context.event.datesLabel}
            </h1>
          </div>

          <div className="border-t border-[#E6C887]/20 divide-y divide-[#E6C887]/15">
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
                    <span className="text-xl sm:text-2xl font-mono text-[#FCFAF7] tabular-nums">
                      {session.startTime}
                    </span>
                    <span className="text-xs font-mono text-[#FCFAF7]/45 tabular-nums">
                      – {session.endTime}
                    </span>
                  </div>

                  {/* Session Title & Venue Column */}
                  <div className="md:col-span-6 space-y-2">
                    <h2 className="text-2xl sm:text-3xl font-display font-normal text-[#FCFAF7]">
                      {session.title}
                    </h2>
                    <div className="flex flex-wrap items-center gap-2 text-xs font-mono tracking-wider uppercase text-[#E6C887]">
                      <span>{session.venueName ?? 'Place to be announced'}</span>
                      {session.venueFloor && (
                        <>
                          <span aria-hidden="true">·</span>
                          <span className="text-[#FCFAF7]/60">
                            {session.venueFloor}
                          </span>
                        </>
                      )}
                      {session.lastUpdatedNote && (
                        <span className="normal-case tracking-normal text-[#E6C887]/80">
                          · {session.lastUpdatedNote}
                        </span>
                      )}
                    </div>
                    {session.speaker && (
                      <p className="text-xs text-[#FCFAF7]/65 pt-1">
                        {session.speaker}
                      </p>
                    )}
                  </div>

                  {/* State Indicator Column */}
                  <div className="md:col-span-3 flex md:justify-end items-center gap-4">
                    {isPast && (
                      <span className="text-xs font-mono text-[#E6C887]/70 inline-flex items-center gap-1.5">
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
                      <span className="text-xs font-mono text-[#E6C887] font-semibold tracking-widest">
                        UPDATED
                      </span>
                    )}
                    <button
                      type="button"
                      onClick={onOpenVenueMap}
                      className="text-xs text-[#E6C887]/70 hover:text-[#FCFAF7] underline cursor-pointer whitespace-nowrap"
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
                  if (!credCardRef.current || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
                  const rect = credCardRef.current.getBoundingClientRect();
                  const x = (e.clientX - rect.left) / rect.width - 0.5;
                  const y = (e.clientY - rect.top) / rect.height - 0.5;
                  setCardTilt({ rotateX: -y * 7, rotateY: x * 7 });
                }}
                onMouseLeave={() => setCardTilt({ rotateX: 0, rotateY: 0 })}
                style={{
                  transform: `perspective(1100px) rotateX(${cardTilt.rotateX}deg) rotateY(${cardTilt.rotateY}deg)`,
                }}
                className="auv-credential-object w-full max-w-md border border-[#E6C887]/55 bg-gradient-to-b from-[#120608] via-[#0A0204] to-[#080203] p-8 sm:p-10 space-y-8 transition-transform duration-200 ease-out shadow-2xl"
              >
                {/* Top Brand Mark & Status */}
                <div className="flex items-center justify-between border-b border-[#E6C887]/25 pb-5">
                  <span className="text-xs font-mono tracking-[0.28em] text-[#E6C887]">
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
                  <h1 className="text-3xl sm:text-4xl font-display font-normal text-[#FCFAF7] tracking-wide uppercase">
                    {myApp?.applicantName || user?.displayName}
                  </h1>
                  <p className="text-xs font-mono tracking-widest text-[#E6C887] uppercase">
                    {myCred.roleCategory || 'PARTICIPANT'}
                  </p>
                </div>

                {/* Event Title */}
                <div className="space-y-1 pt-2 border-t border-[#E6C887]/15">
                  <p className="text-sm font-display text-[#FCFAF7]/90">
                    {context.event.title}
                  </p>
                  <p className="text-xs font-mono text-[#FCFAF7]/55 tabular-nums">
                    {context.event.location} · {context.event.datesLabel}
                  </p>
                </div>

                {/* Scannable QR Code */}
                <div className="auv-credential-qr pt-2 flex flex-col items-center justify-center space-y-4">
                  <div className="bg-[#FCFAF7] p-5">
                    <QRCodeSVG
                      value={verificationUrl}
                      size={168}
                      bgColor="#FCFAF7"
                      fgColor="#080203"
                      level="M"
                    />
                  </div>
                  <p className="text-xs font-mono tracking-widest text-[#E6C887] tabular-nums">
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
                  className="px-5 py-2.5 text-xs font-semibold bg-[#E51E2B] text-[#FCFAF7] hover:bg-[#C41224] transition-colors inline-flex items-center gap-2 cursor-pointer whitespace-nowrap"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                  Verify Credential
                </button>

                <button
                  type="button"
                  onClick={handleCopyVerificationUrl}
                  className="px-4 py-2.5 text-xs border border-[#E6C887]/35 text-[#E6C887] hover:bg-[#120608] transition-colors inline-flex items-center gap-2 cursor-pointer whitespace-nowrap"
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
            <div className="max-w-md w-full border border-[#E6C887]/25 bg-[#120608] p-10 text-center space-y-5">
              <p className="text-xs font-mono tracking-widest text-[#E6C887]">
                CREDENTIAL
              </p>
              <h2 className="text-2xl font-display text-[#FCFAF7]">
                {myApp?.status === 'UNDER_REVIEW'
                  ? 'Application Under Review'
                  : 'No credential has been issued.'}
              </h2>
              <p className="text-xs text-[#FCFAF7]/70 leading-relaxed">
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
                  disabled={context.event.applicationStatus !== 'OPEN'}
                  className="px-6 py-3 text-xs font-semibold bg-[#E51E2B] text-[#FCFAF7] hover:bg-[#C41224] transition-colors cursor-pointer"
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
                      ? 'bg-[#E6C887] text-[#080203] font-semibold'
                      : 'border border-[#E6C887]/30 text-[#E6C887]'
                  }`}
                >
                  {ev.title}
                </button>
              ))}
            </div>
          )}

          {/* Editorial Event Hero */}
          <section className="space-y-6">
            <div className="flex flex-wrap items-center gap-3 text-xs font-mono tracking-widest text-[#E6C887]">
              <span>{context.event.location.toUpperCase()}</span>
              <span aria-hidden="true">·</span>
              <span>{context.event.datesLabel.toUpperCase()}</span>
              {myApp && (
                <>
                  <span aria-hidden="true">·</span>
                  <span className="text-[#E6C887]">{myApp.status}</span>
                </>
              )}
            </div>

            <h1 className="text-4xl sm:text-5xl lg:text-6xl font-display font-normal text-[#FCFAF7] leading-[1.08] max-w-4xl">
              {context.event.title}
            </h1>

            <p className="text-lg sm:text-xl font-display italic text-[#E6C887] max-w-2xl">
              {context.event.subtitle}
            </p>

            <p className="text-sm text-[#FCFAF7]/75 max-w-2xl leading-relaxed">
              {context.event.description}
            </p>

            {/* Single Contextual Action */}
            <div className="pt-4">
              {myApp?.status === 'ACCEPTED' ? (
                <div className="flex flex-wrap items-center gap-4">
                  <button
                    type="button"
                    onClick={() => handleSelectSubTab('TODAY')}
                    className="px-6 py-3 text-xs font-semibold tracking-wider bg-[#E51E2B] text-[#FCFAF7] hover:bg-[#C41224] transition-colors inline-flex items-center gap-2 cursor-pointer whitespace-nowrap"
                  >
                    Open Participant Space
                    <ArrowRight className="w-4 h-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => handleSelectSubTab('CREDENTIAL')}
                    className="px-5 py-3 text-xs border border-[#E6C887]/40 text-[#E6C887] hover:bg-[#120608] transition-colors cursor-pointer whitespace-nowrap"
                  >
                    View Credential
                  </button>
                </div>
              ) : myApp ? (
                <div className="border-t border-[#E6C887]/20 pt-6 space-y-2 max-w-xl">
                  <p className="text-xs font-mono tracking-widest text-[#E6C887]">
                    APPLICATION STATUS · {myApp.status}
                  </p>
                  <p className="text-base text-[#FCFAF7]">
                    Submitted by {myApp.applicantName} ({myApp.institution}) for{' '}
                    {myApp.category}.
                  </p>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setShowApplyForm(true)}
                  className="px-7 py-3.5 text-xs font-semibold tracking-widest bg-[#E51E2B] text-[#FCFAF7] hover:bg-[#C41224] transition-colors inline-flex items-center gap-2.5 cursor-pointer whitespace-nowrap"
                >
                  {context.event.applicationStatus === 'OPEN' ? 'APPLY' : context.event.applicationStatus === 'CLOSED' ? 'APPLICATIONS CLOSED' : 'APPLICATIONS COMING SOON'}
                  <ArrowRight className="w-4 h-4" />
                </button>
              )}
            </div>
          </section>

          {appMessage && (
            <div className="border border-[#E6C887]/40 bg-[#120608] p-6 text-sm text-[#FCFAF7]">
              {appMessage.text}
            </div>
          )}

          {/* Application Form */}
          {showApplyForm && !myApp && context.event.applicationStatus === 'OPEN' && (
            <section className="pt-10 border-t border-[#E6C887]/20 max-w-2xl space-y-6">
              <div className="space-y-1">
                <p className="text-xs font-mono tracking-widest text-[#E6C887]">
                  PARTICIPANT APPLICATION
                </p>
                <h2 className="text-2xl font-display text-[#FCFAF7]">
                  Apply for {context.event.title}
                </h2>
              </div>

              <form onSubmit={handleSubmitApplication} className="space-y-5">
                <div className="grid sm:grid-cols-2 gap-5">
                  <div className="space-y-1.5">
                    <label className="block text-xs text-[#E6C887]">
                      Full Name
                    </label>
                    <input
                      type="text"
                      aria-label="Full Name"
                      required
                      value={applicantName}
                      onChange={(e) => setApplicantName(e.target.value)}
                      className="w-full px-4 py-3 text-sm bg-[#120608] border border-[#E6C887]/35 text-[#FCFAF7] focus:outline-none focus:border-[#E6C887]"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="block text-xs text-[#E6C887]">
                      Institution / Organisation
                    </label>
                    <input
                      type="text"
                      required
                      aria-label="Institution / Organisation"
                      value={institution}
                      onChange={(e) => setInstitution(e.target.value)}
                      className="w-full px-4 py-3 text-sm bg-[#120608] border border-[#E6C887]/35 text-[#FCFAF7] focus:outline-none focus:border-[#E6C887]"
                    />
                  </div>
                </div>

                {context.event.categories.length > 0 && (
                <div className="space-y-1.5">
                  <label className="block text-xs text-[#E6C887]">
                    How would you like to take part?
                  </label>
                  <select
                    value={category || context.event.categories[0]}
                    onChange={(e) => setCategory(e.target.value)}
                    className="w-full px-4 py-3 text-sm bg-[#120608] border border-[#E6C887]/35 text-[#FCFAF7] focus:outline-none focus:border-[#E6C887]"
                  >
                    {context.event.categories.map((cat) => (
                      <option key={cat} value={cat}>
                        {cat}
                      </option>
                    ))}
                  </select>
                </div>
                )}

                {context.event.applicationConfig?.requirePhone && <label className="block text-xs text-[#E6C887]">Phone number<input aria-label="Phone number" type="tel" required maxLength={40} value={phone} onChange={e => setPhone(e.target.value)} className="w-full mt-2 px-4 py-3 text-sm bg-[#120608] border border-[#E6C887]/35" /></label>}
                {context.event.applicationConfig?.customQuestionLabel && <label className="block text-xs text-[#E6C887]">{context.event.applicationConfig.customQuestionLabel}<textarea aria-label="Event question" required={context.event.applicationConfig.customQuestionRequired} maxLength={1000} value={customAnswer} onChange={e => setCustomAnswer(e.target.value)} className="w-full mt-2 px-4 py-3 text-sm bg-[#120608] border border-[#E6C887]/35" /></label>}
                <div className="space-y-1.5">
                  <label className="block text-xs text-[#E6C887]">
                    Why would you like to take part? (min. 15 characters)
                  </label>
                  <textarea
                    rows={3}
                    required
                    minLength={15}
                    aria-label="Why would you like to take part?"
                    value={statement}
                    onChange={(e) => setStatement(e.target.value)}
                    className="w-full px-4 py-3 text-sm bg-[#120608] border border-[#E6C887]/35 text-[#FCFAF7] focus:outline-none focus:border-[#E6C887]"
                  />
                </div>

                <button
                  type="submit"
                  disabled={submittingApp}
                  className="px-6 py-3 text-xs font-semibold tracking-wider bg-[#E51E2B] text-[#FCFAF7] hover:bg-[#C41224] transition-colors cursor-pointer disabled:opacity-50"
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
