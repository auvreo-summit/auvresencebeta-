import React, { useMemo, useState } from 'react';
import { ArrowLeft, ArrowRight } from 'lucide-react';
import type { EventSummary } from '../types.ts';

interface CreateEventViewProps {
  /** Always the live Firebase ID token; the server derives ownership from it. */
  getToken: () => Promise<string | null>;
  initialDescription?: string;
  onCancel: () => void;
  onCreated: (event: EventSummary) => void | Promise<void>;
}

// Suggestions only — the stored value is free-form data. 'Custom' lets the
// organiser type their own type.
export const CUSTOM_EVENT_TYPE = 'Custom';
export const EVENT_TYPES = [
  'Conference',
  'Hackathon',
  'Workshop',
  'Exhibition',
  'College Fest',
  'Technology Showcase',
  'Sports Event',
  'Cultural Event',
  CUSTOM_EVENT_TYPE,
];

const todayIso = () => {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
};

// Some browsers still report legacy IANA names (e.g. Chrome: Asia/Calcutta).
const TZ_ALIASES: Record<string, string> = {
  'Asia/Calcutta': 'Asia/Kolkata',
  'Asia/Saigon': 'Asia/Ho_Chi_Minh',
  'Asia/Katmandu': 'Asia/Kathmandu',
  'Asia/Rangoon': 'Asia/Yangon',
};
const canonicalTz = (tz: string) => TZ_ALIASES[tz] ?? tz;

function listTimezones(): string[] {
  let base: string[] = [];
  try {
    const fn = (Intl as any).supportedValuesOf;
    if (typeof fn === 'function') base = fn.call(Intl, 'timeZone') as string[];
  } catch {
    /* fall through */
  }
  const set = new Set(base.map(canonicalTz));
  ['UTC', 'Asia/Kolkata', 'Europe/London', 'America/New_York'].forEach((z) =>
    set.add(z)
  );
  return [...set].sort();
}

const fieldLabel =
  'block text-[11px] font-mono tracking-[0.28em] uppercase text-[#E6C887]';
const fieldBase =
  'mt-3 w-full bg-transparent border-0 border-b border-[#E6C887]/35 px-0 py-3 text-lg text-[#FCFAF7] placeholder:text-[#FCFAF7]/55 outline-none focus:border-[#E6C887] transition-colors [color-scheme:dark]';

export const CreateEventView: React.FC<CreateEventViewProps> = ({
  getToken,
  initialDescription,
  onCancel,
  onCreated,
}) => {
  const timezones = useMemo(listTimezones, []);
  const defaultTz = useMemo(() => {
    try {
      const tz = canonicalTz(Intl.DateTimeFormat().resolvedOptions().timeZone);
      return tz && timezones.includes(tz) ? tz : 'Asia/Kolkata';
    } catch {
      return 'Asia/Kolkata';
    }
  }, [timezones]);

  const [title, setTitle] = useState('');
  const [eventType, setEventType] = useState(EVENT_TYPES[0]);
  const [customType, setCustomType] = useState('');
  const [description, setDescription] = useState(initialDescription ?? '');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [timezone, setTimezone] = useState(defaultTz);
  const [location, setLocation] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<EventSummary | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  const validate = () => {
    const e: Record<string, string> = {};
    if (title.trim().length < 3) e.title = 'Give your event a name (3+ characters).';
    if (description.trim().length < 10)
      e.description = 'Describe it in a sentence or two (10+ characters).';
    if (!startDate) e.startDate = 'Choose a start date.';
    if (!endDate) e.endDate = 'Choose an end date.';
    if (startDate && endDate && endDate < startDate)
      e.endDate = 'End date must be on or after the start date.';
    if (location.trim().length < 2) e.location = 'Where is it happening?';
    setFieldErrors(e);
    return Object.keys(e).length === 0;
  };

  const submit = async (ev: React.FormEvent) => {
    ev.preventDefault();
    setError(null);
    if (!validate()) return;

    setSubmitting(true);
    try {
      const token = await getToken();
      if (!token) throw new Error('Your session has ended. Please sign in again.');

      const res = await fetch('/api/events', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          title: title.trim(),
          eventType:
            eventType === CUSTOM_EVENT_TYPE
              ? customType.trim() || CUSTOM_EVENT_TYPE
              : eventType,
          description: description.trim(),
          startDate,
          endDate,
          timezone,
          location: location.trim(),
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (res.status === 400 && Array.isArray(json.issues)) {
          const mapped: Record<string, string> = {};
          for (const i of json.issues) {
            const key = String(i.path?.[0] ?? '');
            if (key) mapped[key] = i.message;
          }
          setFieldErrors(mapped);
        }
        throw new Error(json.error || 'Could not create the event.');
      }
      setCreated(json.event as EventSummary);
      setSubmitting(false);
    } catch (err: any) {
      setError(err.message || 'Could not create the event.');
      setSubmitting(false);
    }
  };

  const err = (k: string) =>
    fieldErrors[k] ? (
      <p className="mt-2 text-xs text-[#E6C887]/80" role="alert">
        {fieldErrors[k]}
      </p>
    ) : null;

  if (created) return (
    <section className="mx-auto max-w-2xl px-6 py-24 sm:py-32" aria-labelledby="created-title">
      <p className="text-xs font-mono tracking-[0.3em] text-[#E6C887]">EVENT CREATED</p>
      <h1 id="created-title" className="mt-6 font-display text-5xl sm:text-7xl">{created.title}</h1>
      <p className="mt-6 text-[#E6C887] text-xl">Your event is ready to shape.</p>
      <p className="mt-4 text-[#FCFAF7]/65">Build the programme, map your venue, and welcome your people.</p>
      <button type="button" className="auv-btn auv-btn-primary mt-10" onClick={() => onCreated(created)}>Enter Studio <ArrowRight className="h-4 w-4" /></button>
    </section>
  );

  return (
    <div className="auv-create auv-atmosphere relative min-h-[calc(100vh-4rem)]">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 top-0 h-[480px]"
        style={{
          background:
            'radial-gradient(60% 100% at 50% 0%, rgba(78,10,23,0.55), transparent)',
        }}
      />
      <div className="relative mx-auto w-full max-w-2xl px-6 pb-32 pt-12 sm:pt-20">
        <button
          type="button"
          onClick={onCancel}
          className="inline-flex items-center gap-2 text-[11px] tracking-[0.28em] uppercase text-[#FCFAF7]/60 hover:text-[#E6C887] cursor-pointer"
        >
          <ArrowLeft className="h-3.5 w-3.5" /> Home
        </button>

        <p className="mt-14 text-[11px] font-mono tracking-[0.4em] text-[#E6C887]">
          ORGANISE AN EVENT
        </p>
        <h1 className="mt-5 font-display text-5xl sm:text-6xl leading-[1.05] tracking-tight text-[#FCFAF7]">
          What are you bringing to life?
        </h1>
        <p className="mt-5 max-w-lg text-[#FCFAF7]/65">
          Start with the essentials. You can shape everything else inside your
          Organiser Studio.
        </p>

        <form onSubmit={submit} noValidate className="auv-create-form mt-14 space-y-8">
          <p className="create-section-label">01 / IDENTITY</p>
          <div>
            <label htmlFor="ev-title" className={fieldLabel}>
              Event name
            </label>
            <input
              id="ev-title"
              data-testid="ev-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              maxLength={160}
              placeholder="Give it a name"
              className={`${fieldBase} font-display text-3xl`}
              autoFocus
            />
            {err('title')}
          </div>

          <div>
            <label htmlFor="ev-type" className={fieldLabel}>
              Event type
            </label>
            <select
              id="ev-type"
              data-testid="ev-type"
              value={eventType}
              onChange={(e) => setEventType(e.target.value)}
              className={`${fieldBase} appearance-none cursor-pointer`}
            >
              {EVENT_TYPES.map((t) => (
                <option key={t} value={t} className="bg-[#120608]">
                  {t}
                </option>
              ))}
            </select>
            {eventType === CUSTOM_EVENT_TYPE && (
              <input
                type="text"
                data-testid="ev-type-custom"
                aria-label="Custom event type"
                value={customType}
                maxLength={60}
                onChange={(e) => setCustomType(e.target.value)}
                placeholder="What kind of event is it?"
                className={`${fieldBase} mt-2`}
              />
            )}
            {err('eventType')}
          </div>

          <p className="create-section-label">02 / WHEN</p>
          <div className="grid gap-8 sm:grid-cols-2">
            <div>
              <label htmlFor="ev-start" className={fieldLabel}>
                Start date
              </label>
              <input
                id="ev-start"
                data-testid="ev-start"
                type="date"
                min={todayIso()}
                value={startDate}
                onChange={(e) => {
                  setStartDate(e.target.value);
                  if (!endDate || endDate < e.target.value)
                    setEndDate(e.target.value);
                }}
                className={fieldBase}
              />
              {err('startDate')}
            </div>
            <div>
              <label htmlFor="ev-end" className={fieldLabel}>
                End date
              </label>
              <input
                id="ev-end"
                data-testid="ev-end"
                type="date"
                min={startDate || todayIso()}
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className={fieldBase}
              />
              {err('endDate')}
            </div>
          </div>

          <div className="space-y-8">
            <div>
              <label htmlFor="ev-tz" className={fieldLabel}>
                Timezone
              </label>
              <select
                id="ev-tz"
                data-testid="ev-timezone"
                value={timezone}
                onChange={(e) => setTimezone(e.target.value)}
                className={`${fieldBase} appearance-none cursor-pointer`}
              >
                {timezones.map((t) => (
                  <option key={t} value={t} className="bg-[#120608]">
                    {t.replace(/_/g, ' ')}
                  </option>
                ))}
              </select>
              {err('timezone')}
            </div>
            <div>
              <p className="create-section-label mb-6">03 / WHERE</p>
              <label htmlFor="ev-loc" className={fieldLabel}>
                City / location
              </label>
              <input
                id="ev-loc"
                data-testid="ev-location"
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                maxLength={140}
                placeholder="e.g. Chandigarh"
                className={fieldBase}
              />
              {err('location')}
            </div>
          </div>

          <p className="create-section-label">04 / ABOUT</p>
          <div>
            <label htmlFor="ev-desc" className={fieldLabel}>
              Description
            </label>
            <textarea
              id="ev-desc"
              data-testid="ev-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={4}
              maxLength={2000}
              placeholder="What is it, and who is it for?"
              className={`${fieldBase} resize-none leading-relaxed`}
            />
            {err('description')}
          </div>

          {error && (
            <p
              role="alert"
              data-testid="create-error"
              className="border-l-2 border-[#E6C887] pl-4 text-sm text-[#E6C887]"
            >
              {error}
            </p>
          )}

          <div className="flex flex-wrap items-center gap-6 pt-2">
            <button
              type="submit"
              data-testid="create-event-submit"
              disabled={submitting}
              className="inline-flex items-center gap-3 bg-[#E51E2B] px-8 py-4 text-xs font-semibold tracking-[0.22em] uppercase text-[#FCFAF7] hover:bg-[#C41224] transition-colors disabled:opacity-60 cursor-pointer"
            >
              {submitting ? 'Creating…' : 'Create event'}
              {!submitting && <ArrowRight className="h-4 w-4" />}
            </button>
            <button
              type="button"
              onClick={onCancel}
              disabled={submitting}
              className="text-xs tracking-[0.22em] uppercase text-[#FCFAF7]/55 hover:text-[#FCFAF7] cursor-pointer"
            >
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
