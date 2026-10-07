import React, { useState, useEffect, useRef } from 'react';
import { useDialogFocus } from '../hooks/useDialogFocus.ts';
import {
  ArrowRight,
  Image as ImageIcon,
  Mic,
  Send,
  ArrowUpRight,
  Volume2,
  X,
} from 'lucide-react';
import type { EventFullContext, UserProfile } from '../types.ts';
import type { ActionArchitectureTrace } from './ActionXRayModal.tsx';

interface AskAuvresenceDrawerProps {
  isOpen: boolean;
  initialQuestion?: string;
  onClose: () => void;
  user: UserProfile | null;
  authToken: string | null;
  context: EventFullContext | null;
  isOrganiserContext?: boolean;
  voiceConfigured?: boolean;
  visionConfigured?: boolean;
  onSignInAsParticipant: () => Promise<string | null>;
  onSwitchToOrganiserAccount?: () => Promise<string | null>;
  onRefreshContext?: () => Promise<void>;
  onNavigateVenue?: () => void;
  onNavigateSchedule?: () => void;
  onNavigateOrganiserApplications?: () => void;
  onRecordActionTrace?: (trace: ActionArchitectureTrace) => void;
}

interface PendingVenueProposal {
  sessionId: number;
  sessionTitle: string;
  fromVenueName: string;
  toVenueId: number;
  toVenueName: string;
  confirmed?: boolean;
  cancelled?: boolean;
}

interface QAMessage {
  id: string;
  question: string;
  answer?: string;
  error?: string;
  timestamp: string;
  structuredCard?: 'NEXT_DESTINATION' | 'WHAT_CHANGED' | 'ORGANISER_ATTENTION';
  venueProposal?: PendingVenueProposal;
}

const PARTICIPANT_SUGGESTIONS = [
  "What's next?",
  'Where do I go?',
  'What changed?',
  'Brief my day.',
];

const ORGANISER_SUGGESTIONS = [
  'What needs attention?',
  'Show pending applications.',
  "What's happening now?",
  'What changed recently?',
];

export const AskAuvresenceDrawer: React.FC<AskAuvresenceDrawerProps> = ({
  isOpen,
  initialQuestion,
  onClose,
  user,
  authToken,
  context,
  isOrganiserContext,
  voiceConfigured,
  visionConfigured,
  onSignInAsParticipant,
  onSwitchToOrganiserAccount,
  onRefreshContext,
  onNavigateVenue,
  onNavigateSchedule,
  onNavigateOrganiserApplications,
  onRecordActionTrace,
}) => {
  const [questionInput, setQuestionInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [voiceState, setVoiceState] = useState<
    'IDLE' | 'LISTENING' | 'UNDERSTANDING' | 'THINKING' | 'SPEAKING'
  >('IDLE');
  const [attachedImage, setAttachedImage] = useState<string | null>(null);
  const [history, setHistory] = useState<QAMessage[]>([]);
  const [confirmingProposalId, setConfirmingProposalId] = useState<
    string | null
  >(null);

  const dialogRef = useDialogFocus(isOpen, onClose);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  useEffect(() => {
    if (isOpen && initialQuestion) {
      setQuestionInput(initialQuestion);
    }
  }, [isOpen, initialQuestion]);

  if (!isOpen) return null;

  const suggestions = isOrganiserContext
    ? ORGANISER_SUGGESTIONS
    : PARTICIPANT_SUGGESTIONS;

  const detectStructuredCard = (
    q: string
  ): QAMessage['structuredCard'] | undefined => {
    const lower = q.toLowerCase();
    if (/\b(where|next|go)\b/.test(lower)) {
      return 'NEXT_DESTINATION';
    }
    if (lower.includes('change') || lower.includes('update')) {
      return 'WHAT_CHANGED';
    }
    if (lower.includes('pending') || lower.includes('attention')) {
      return 'ORGANISER_ATTENTION';
    }
    return undefined;
  };

  // Proposes (never applies) a session move. The target session and place are
  // resolved ONLY by matching names that exist in this event's own data; there
  // are no fallbacks and no special names. The organiser must still confirm.
  const detectConsequentialVenueProposal = (
    q: string
  ): PendingVenueProposal | undefined => {
    if (!context) return undefined;
    const lower = q.toLowerCase();
    if (!/\b(move|change|relocate|shift)\b/.test(lower)) return undefined;

    const targetSession = [...context.sessions]
      .filter((s) => s.title && lower.includes(s.title.toLowerCase()))
      .sort((a, b) => b.title.length - a.title.length)[0];
    if (!targetSession) return undefined;

    const targetVenue = [...context.venues]
      .filter((v) => v.name && lower.includes(v.name.toLowerCase()))
      .sort((a, b) => b.name.length - a.name.length)[0];
    if (!targetVenue || targetVenue.id === targetSession.venueId) {
      return undefined;
    }

    return {
      sessionId: targetSession.id,
      sessionTitle: targetSession.title,
      fromVenueName: targetSession.venueName ?? 'No place set',
      toVenueId: targetVenue.id,
      toVenueName: targetVenue.name,
    };
  };

  const submitQuestion = async (qText: string) => {
    const trimmed = qText.trim();
    if (!trimmed || !context) return;

    // Check if this is a consequential mutation request (e.g. moving a session to another place)
    const proposal = detectConsequentialVenueProposal(trimmed);
    if (proposal) {
      setQuestionInput('');
      setHistory((prev) => [
        {
          id: String(Date.now()),
          question: trimmed,
          answer: 'Review and confirm this venue change before it is applied.',
          timestamp: new Date().toLocaleTimeString([], {
            hour: '2-digit',
            minute: '2-digit',
          }),
          venueProposal: proposal,
        },
        ...prev,
      ]);
      return;
    }

    setLoading(true);
    setQuestionInput('');

    try {
      let tokenToUse = authToken;
      if (!tokenToUse) {
        tokenToUse = await onSignInAsParticipant();
      }
      if (!tokenToUse) {
        throw new Error('Sign in required.');
      }

      // If an image is attached and vision is configured, route to /api/ai/vision
      if (attachedImage) {
        const imgData = attachedImage;
        setAttachedImage(null);
        const res = await fetch('/api/ai/vision', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${tokenToUse}`,
          },
          body: JSON.stringify({
            eventId: context.event.id,
            imageDataUrl: imgData,
            question: trimmed,
          }),
        });
        const json = await res.json();
        if (!res.ok) {
          throw new Error(
            json.error || 'Image understanding is currently unavailable.'
          );
        }
        setHistory((prev) => [
          {
            id: String(Date.now()),
            question: trimmed,
            answer: json.answer,
            timestamp: new Date().toLocaleTimeString([], {
              hour: '2-digit',
              minute: '2-digit',
            }),
            structuredCard: detectStructuredCard(trimmed),
          },
          ...prev,
        ]);
        return;
      }

      const res = await fetch('/api/ai/ask', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${tokenToUse}`,
        },
        body: JSON.stringify({
          eventId: context.event.id,
          question: trimmed,
        }),
      });

      const json = await res.json();
      if (!res.ok) {
        setHistory((prev) => [
          {
            id: String(Date.now()),
            question: trimmed,
            error:
              'Auvresence is temporarily unavailable. Your event information is still accessible.',
            timestamp: new Date().toLocaleTimeString([], {
              hour: '2-digit',
              minute: '2-digit',
            }),
            structuredCard: detectStructuredCard(trimmed),
          },
          ...prev,
        ]);
      } else {
        setHistory((prev) => [
          {
            id: String(Date.now()),
            question: trimmed,
            answer: json.answer,
            timestamp: new Date().toLocaleTimeString([], {
              hour: '2-digit',
              minute: '2-digit',
            }),
            structuredCard: detectStructuredCard(trimmed),
          },
          ...prev,
        ]);

        if (onRecordActionTrace) {
          onRecordActionTrace({
            id: `ai-ask-${Date.now()}`,
            title: 'Auvresence Query Executed',
            subtitle: `Question: "${trimmed}"`,
            timestamp: new Date().toLocaleTimeString(),
            steps: [
              {
                layer: 'REQUEST',
                detail: `POST /api/ai/ask ({ eventId: ${context.event.id}, question: "${trimmed}" })`,
              },
              {
                layer: 'AUTHORISED CONTEXT BUILDER',
                detail: `Assembled permitted schedule, announcements, and upNext venue (${json.authorisedContextSummary?.upNextVenue || 'current'}) from PostgreSQL.`,
              },
              {
                layer: 'AI PROVIDER',
                detail: `Generated grounded answer via ${json.provider}/${json.model}.`,
              },
            ],
          });
        }
      }
    } catch {
      setHistory((prev) => [
        {
          id: String(Date.now()),
          question: trimmed,
          error:
            'Auvresence is temporarily unavailable. Your event information is still accessible.',
          timestamp: new Date().toLocaleTimeString([], {
            hour: '2-digit',
            minute: '2-digit',
          }),
          structuredCard: detectStructuredCard(trimmed),
        },
      ]);
    } finally {
      setLoading(false);
    }
  };

  const handleConfirmVenueProposal = async (
    msgId: string,
    proposal: PendingVenueProposal
  ) => {
    if (!context) return;
    setConfirmingProposalId(msgId);

    try {
      let tokenToUse = authToken;
      if (user?.activeRole !== 'ORGANISER' && onSwitchToOrganiserAccount) {
        tokenToUse = await onSwitchToOrganiserAccount();
      }
      if (!tokenToUse) {
        throw new Error('Organiser authorization required.');
      }

      const targetSession = context.sessions.find(
        (s) => s.id === proposal.sessionId
      );
      if (!targetSession) {
        throw new Error('Session not found.');
      }

      const res = await fetch(
        `/api/organiser/events/${context.event.id}/sessions/${proposal.sessionId}`,
        {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${tokenToUse}`,
          },
          body: JSON.stringify({
            title: targetSession.title,
            description: targetSession.description,
            speaker: targetSession.speaker || '',
            startTime: targetSession.startTime,
            endTime: targetSession.endTime,
            venueId: proposal.toVenueId,
            status: targetSession.status,
          }),
        }
      );

      if (!res.ok) {
        throw new Error("Couldn't update venue.");
      }

      if (onRefreshContext) {
        await onRefreshContext();
      }

      setHistory((prev) =>
        prev.map((m) =>
          m.id === msgId && m.venueProposal
            ? {
                ...m,
                answer: `Venue updated: ${proposal.fromVenueName} → ${proposal.toVenueName}.`,
                venueProposal: { ...m.venueProposal, confirmed: true },
              }
            : m
        )
      );
    } catch {
      setHistory((prev) =>
        prev.map((m) =>
          m.id === msgId
            ? {
                ...m,
                error: "Couldn't update venue. Nothing was changed.",
              }
            : m
        )
      );
    } finally {
      setConfirmingProposalId(null);
    }
  };

  const handleCancelVenueProposal = (msgId: string) => {
    setHistory((prev) =>
      prev.map((m) =>
        m.id === msgId && m.venueProposal
          ? {
              ...m,
              answer: 'Change cancelled. Nothing was modified.',
              venueProposal: { ...m.venueProposal, cancelled: true },
            }
          : m
      )
    );
  };

  // Voice recording toggle (when voiceConfigured is true)
  const handleToggleVoice = async () => {
    if (!context) return;
    if (voiceState === 'LISTENING' && mediaRecorderRef.current) {
      mediaRecorderRef.current.stop();
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      chunksRef.current = [];

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };

      recorder.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        setVoiceState('UNDERSTANDING');

        try {
          const blob = new Blob(chunksRef.current, { type: 'audio/webm' });
          const reader = new FileReader();
          reader.onloadend = async () => {
            const base64 = String(reader.result || '').split(',')[1] || '';
            setVoiceState('THINKING');

            let tokenToUse = authToken;
            if (!tokenToUse) {
              tokenToUse = await onSignInAsParticipant();
            }

            const res = await fetch('/api/ai/voice-ask', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${tokenToUse}`,
              },
              body: JSON.stringify({
                eventId: context.event.id,
                audioBase64: base64,
                mimeType: 'audio/webm',
              }),
            });
            const json = await res.json();
            if (!res.ok) {
              setVoiceState('IDLE');
              return;
            }

            setHistory((prev) => [
              {
                id: String(Date.now()),
                question: json.question || 'Voice query',
                answer: json.answer,
                timestamp: new Date().toLocaleTimeString([], {
                  hour: '2-digit',
                  minute: '2-digit',
                }),
                structuredCard: detectStructuredCard(json.question || ''),
              },
              ...prev,
            ]);

            if (json.audioBase64) {
              setVoiceState('SPEAKING');
              const audio = new Audio(
                `data:${json.audioMimeType || 'audio/wav'};base64,${json.audioBase64}`
              );
              audio.onended = () => setVoiceState('IDLE');
              audio.onerror = () => setVoiceState('IDLE');
              await audio.play();
            } else {
              setVoiceState('IDLE');
            }
          };
          reader.readAsDataURL(blob);
        } catch {
          setVoiceState('IDLE');
        }
      };

      mediaRecorderRef.current = recorder;
      recorder.start();
      setVoiceState('LISTENING');
    } catch {
      setVoiceState('IDLE');
    }
  };

  const upNext = context?.pulse.upNext || null;
  const updatedSession = context?.sessions.find(
    (s) => Boolean(s.lastUpdatedNote)
  );

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/60" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div ref={dialogRef} role="dialog" aria-modal="true" aria-label="Ask Auvresence" tabIndex={-1} className="w-full max-w-lg bg-[#0d0608] border-l border-[#cf9f5d]/35 h-full flex flex-col justify-between shadow-2xl">
        {/* HEADER */}
        <div className="p-7 border-b border-[#cf9f5d]/20 flex items-start justify-between gap-4">
          <div className="space-y-1">
            <p className="text-xs font-mono tracking-[0.26em] text-[#cf9f5d] uppercase">
              ASK AUVRESENCE
            </p>
            <h2 className="text-3xl font-display font-normal text-[#faf6f0]">
              What do you need?
            </h2>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="min-h-11 min-w-11 flex items-center justify-center p-2 text-[#faf6f0]/60 hover:text-[#faf6f0] cursor-pointer"
            aria-label="Close Ask Auvresence"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* BODY */}
        <div className="flex-1 overflow-y-auto p-7 space-y-8">
          {/* Contextual Suggestions */}
          <div className="flex flex-wrap gap-2">
            {suggestions.map((q) => (
              <button
                key={q}
                type="button"
                disabled={loading}
                onClick={() => submitQuestion(q)}
                className="px-3.5 py-2 text-xs bg-[#1a0206] border border-[#cf9f5d]/30 text-[#edd2ab] hover:bg-[#24040a] hover:border-[#cf9f5d] transition-colors cursor-pointer whitespace-nowrap disabled:opacity-50"
              >
                {q}
              </button>
            ))}
          </div>

          {/* Voice State Indicator */}
          {voiceState !== 'IDLE' && (
            <div className="py-3 px-4 border border-[#cf9f5d]/40 bg-[#1a0206] flex items-center justify-between text-xs font-mono text-[#cf9f5d]">
              <span className="inline-flex items-center gap-2">
                <Volume2 className="w-3.5 h-3.5 animate-pulse" />
                {voiceState}
              </span>
              {voiceState === 'LISTENING' && (
                <button
                  type="button"
                  onClick={handleToggleVoice}
                  className="underline text-[#edd2ab] cursor-pointer"
                >
                  Done
                </button>
              )}
            </div>
          )}

          {/* Loading Skeleton */}
          {loading && (
            <div className="space-y-3 py-4 border-t border-[#cf9f5d]/15">
              <div className="h-3 w-24 bg-[#1a0206] animate-pulse" />
              <div className="h-16 bg-[#1a0206] animate-pulse" />
            </div>
          )}

          {/* Conversation Stream */}
          <div className="space-y-8">
            {history.map((item) => (
              <div
                key={item.id}
                className="space-y-4 border-t border-[#cf9f5d]/20 pt-6"
              >
                <div className="flex items-baseline justify-between gap-2">
                  <p className="text-base font-display italic text-[#edd2ab]">
                    {item.question}
                  </p>
                  <span className="text-[11px] font-mono text-[#faf6f0]/40 tabular-nums">
                    {item.timestamp}
                  </span>
                </div>

                {item.error ? (
                  <div className="p-5 border border-[#cf9f5d]/30 bg-[#1a0206] space-y-2">
                    <p className="text-sm font-display text-[#edd2ab]">
                      Auvresence is temporarily unavailable.
                    </p>
                    <p className="text-xs text-[#faf6f0]/70">
                      Your event information is still accessible.
                    </p>
                  </div>
                ) : (
                  item.answer && (
                    <p className="text-sm text-[#faf6f0]/90 leading-relaxed whitespace-pre-line">
                      {item.answer}
                    </p>
                  )
                )}

                {/* CONSEQUENTIAL AI ACTION CONFIRMATION CARD */}
                {item.venueProposal && (
                  <div className="border border-[#cf9f5d]/50 bg-[#1a0206] p-6 space-y-5">
                    <p className="text-xs font-mono tracking-widest text-[#cf9f5d]">
                      CHANGE SESSION VENUE
                    </p>

                    <div className="space-y-2">
                      <h3 className="text-2xl font-display text-[#faf6f0]">
                        {item.venueProposal.sessionTitle}
                      </h3>
                      <div className="flex items-center gap-3 text-base font-mono text-[#edd2ab]">
                        <span>
                          {item.venueProposal.fromVenueName.toUpperCase()}
                        </span>
                        <span>→</span>
                        <span className="font-semibold text-[#faf6f0]">
                          {item.venueProposal.toVenueName.toUpperCase()}
                        </span>
                      </div>
                    </div>

                    <p className="text-xs text-[#faf6f0]/70">
                      This will update participant-facing event information.
                    </p>

                    {!item.venueProposal.confirmed &&
                      !item.venueProposal.cancelled && (
                        <div className="flex items-center gap-3 pt-2">
                          <button
                            type="button"
                            onClick={() => handleCancelVenueProposal(item.id)}
                            className="px-4 py-2.5 text-xs border border-[#cf9f5d]/35 text-[#edd2ab] hover:bg-[#24040a] transition-colors cursor-pointer"
                          >
                            CANCEL
                          </button>
                          <button
                            type="button"
                            disabled={confirmingProposalId === item.id}
                            onClick={() =>
                              handleConfirmVenueProposal(
                                item.id,
                                item.venueProposal!
                              )
                            }
                            className="px-5 py-2.5 text-xs font-semibold bg-[#cf9f5d] text-[#0d0608] hover:bg-[#edd2ab] transition-colors cursor-pointer disabled:opacity-50"
                          >
                            {confirmingProposalId === item.id
                              ? 'UPDATING...'
                              : 'CONFIRM CHANGE'}
                          </button>
                        </div>
                      )}
                  </div>
                )}

                {/* STRUCTURED UI: NEXT DESTINATION CARD */}
                {item.structuredCard === 'NEXT_DESTINATION' && upNext && (
                  <div className="border border-[#cf9f5d]/40 bg-[#1a0206] p-6 space-y-4">
                    <div className="space-y-1">
                      <p className="text-xs font-mono tracking-widest text-[#cf9f5d] uppercase">
                        {upNext.title}
                      </p>
                      <p className="text-sm font-mono text-[#faf6f0]/75 tabular-nums">
                        {upNext.startTime}
                      </p>
                      <p className="text-2xl font-display text-[#edd2ab] uppercase pt-1">
                        {upNext.venueName}
                      </p>
                    </div>

                    {onNavigateVenue && (
                      <button
                        type="button"
                        onClick={() => {
                          onClose();
                          onNavigateVenue();
                        }}
                        className="px-5 py-2.5 text-xs font-semibold tracking-wider bg-[#cf9f5d] text-[#0d0608] hover:bg-[#edd2ab] transition-colors inline-flex items-center gap-2 cursor-pointer"
                      >
                        VIEW VENUE
                        <ArrowRight className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                )}

                {/* STRUCTURED UI: WHAT CHANGED CARD */}
                {item.structuredCard === 'WHAT_CHANGED' && updatedSession && (
                  <div className="border border-[#cf9f5d]/40 bg-[#1a0206] p-6 space-y-4">
                    <p className="text-xs font-mono tracking-widest text-[#cf9f5d]">
                      ONE UPDATE
                    </p>
                    <h3 className="text-xl font-display text-[#faf6f0]">
                      {updatedSession.title}
                    </h3>
                    <p className="text-sm font-mono text-[#edd2ab]">
                      {updatedSession.venueName ? `Current destination · ${updatedSession.venueName}` : 'Destination not assigned'}
                    </p>
                    {onNavigateSchedule && (
                      <button
                        type="button"
                        onClick={() => {
                          onClose();
                          onNavigateSchedule();
                        }}
                        className="px-5 py-2.5 text-xs font-semibold tracking-wider border border-[#cf9f5d]/45 text-[#edd2ab] hover:bg-[#24040a] transition-colors inline-flex items-center gap-2 cursor-pointer"
                      >
                        OPEN MY DAY
                        <ArrowRight className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                )}

                {/* STRUCTURED UI: ORGANISER ATTENTION CARD */}
                {item.structuredCard === 'ORGANISER_ATTENTION' &&
                  onNavigateOrganiserApplications && (
                    <div className="pt-1">
                      <button
                        type="button"
                        onClick={() => {
                          onClose();
                          onNavigateOrganiserApplications();
                        }}
                        className="px-5 py-2.5 text-xs font-semibold tracking-wider bg-[#cf9f5d] text-[#0d0608] hover:bg-[#edd2ab] transition-colors inline-flex items-center gap-2 cursor-pointer"
                      >
                        OPEN APPLICATIONS
                        <ArrowRight className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  )}
              </div>
            ))}
          </div>
        </div>

        {/* COMPOSER FOOTER */}
        <div className="p-5 border-t border-[#cf9f5d]/20 bg-[#1a0206] space-y-3">
          {attachedImage && (
            <div className="flex items-center justify-between text-xs text-[#edd2ab] bg-[#0d0608] px-3 py-2 border border-[#cf9f5d]/30">
              <span>Image attached</span>
              <button
                type="button"
                onClick={() => setAttachedImage(null)}
                className="text-[#faf6f0]/60 hover:text-[#faf6f0] cursor-pointer"
              >
                Remove
              </button>
            </div>
          )}

          <form
            onSubmit={(e) => {
              e.preventDefault();
              submitQuestion(questionInput);
            }}
            className="flex items-center gap-2"
          >
            {visionConfigured && (
              <>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (!file) return;
                    const reader = new FileReader();
                    reader.onloadend = () => {
                      setAttachedImage(String(reader.result || ''));
                    };
                    reader.readAsDataURL(file);
                  }}
                />
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  title="Attach image"
                  className="p-2.5 border border-[#cf9f5d]/30 text-[#edd2ab] hover:bg-[#24040a] transition-colors cursor-pointer shrink-0"
                >
                  <ImageIcon className="w-4 h-4" />
                </button>
              </>
            )}

            {voiceConfigured && (
              <button
                type="button"
                onClick={handleToggleVoice}
                title="Speak to Auvresence"
                className={`p-2.5 border transition-colors cursor-pointer shrink-0 ${
                  voiceState === 'LISTENING'
                    ? 'bg-[#cf9f5d] text-[#0d0608] border-[#cf9f5d]'
                    : 'border-[#cf9f5d]/30 text-[#edd2ab] hover:bg-[#24040a]'
                }`}
              >
                <Mic className="w-4 h-4" />
              </button>
            )}

            <input
              type="text"
              value={questionInput}
              onChange={(e) => setQuestionInput(e.target.value)}
              placeholder="Ask about your event..."
              className="flex-1 px-4 py-2.5 text-sm bg-[#0d0608] border border-[#cf9f5d]/35 text-[#faf6f0] placeholder:text-[#faf6f0]/40 focus:outline-none focus:border-[#cf9f5d]"
            />

            <button
              type="submit"
              disabled={loading || !questionInput.trim()}
              className="px-4 py-2.5 text-xs font-semibold bg-[#cf9f5d] text-[#0d0608] hover:bg-[#edd2ab] transition-colors inline-flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
            >
              <Send className="w-3.5 h-3.5" />
            </button>
          </form>
        </div>
      </div>
    </div>
  );
};
