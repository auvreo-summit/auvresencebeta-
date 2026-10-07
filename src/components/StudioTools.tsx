import React, { useState } from 'react';
import type { EventFullContext } from '../types.ts';

const field = 'w-full min-w-0 mt-2 px-4 py-3 bg-[#1a0206] border border-[#cf9f5d]/30 text-[#faf6f0] focus:border-[#cf9f5d] outline-none';
const label = 'block text-xs text-[#edd2ab]';
interface Props { context: EventFullContext; token: string | null; onSaved: () => Promise<void> }
async function write(path: string, token: string | null, body: unknown, method = 'POST') {
  if (!token) throw new Error('Please sign in again.');
  const response = await fetch(path, { method, headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify(body) });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || 'Changes could not be saved.');
  return result;
}

export function SessionComposer({ context, token, onSaved }: Props) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  return <div>
    <button type="button" className="auv-btn auv-btn-secondary" onClick={() => setOpen(!open)}>{open ? 'Close new session' : 'Add session'}</button>
    {notice && <p role="status" className="mt-4 text-sm text-[#edd2ab]">{notice}</p>}
    {open && <form aria-label="New session" className="mt-6 grid sm:grid-cols-2 gap-5 border-y border-[#cf9f5d]/20 py-6" onSubmit={async e => {
      e.preventDefault(); const form = e.currentTarget; const data = new FormData(form); setBusy(true); setNotice('');
      try {
        await write(`/api/organiser/events/${context.event.id}/sessions`, token, { title: data.get('title'), description: data.get('description'), speaker: data.get('speaker'), startTime: data.get('startTime'), endTime: data.get('endTime'), dayLabel: data.get('dayLabel'), track: data.get('track'), venueId: data.get('venueId') ? Number(data.get('venueId')) : null, status: 'UPCOMING' });
        await onSaved(); form.reset(); setNotice('Session saved.'); setOpen(false);
      } catch (error: any) { setNotice(error.message); } finally { setBusy(false); }
    }}>
      <label className={label}>Session title<input name="title" required minLength={2} maxLength={140} className={field} /></label>
      <label className={label}>Speaker (optional)<input name="speaker" maxLength={140} className={field} /></label>
      <label className={label + ' sm:col-span-2'}>Description<textarea name="description" required minLength={4} maxLength={1000} className={field} /></label>
      <label className={label}>Start time<input name="startTime" type="time" required className={field} /></label>
      <label className={label}>End time<input name="endTime" type="time" required className={field} /></label>
      <label className={label}>Day label<input name="dayLabel" defaultValue="Day 1" required minLength={2} maxLength={80} className={field} /></label>
      <label className={label}>Track<input name="track" defaultValue="General" required minLength={2} maxLength={100} className={field} /></label>
      <label className={label}>Place<select name="venueId" className={field}><option value="">Not assigned yet</option>{context.venues.map(v => <option key={v.id} value={v.id}>{v.name} · {v.floor}</option>)}</select></label>
      <div className="flex items-end"><button className="auv-btn auv-btn-primary" disabled={busy}>{busy ? 'Saving…' : 'Save session'}</button></div>
      <p className="text-xs text-[#faf6f0]/60 sm:col-span-2">Times use {context.event.timezone}. Live status is set by the organiser. Session deletion is not available.</p>
    </form>}
  </div>;
}

export function StudioSettings({ context, token, onSaved }: Props) {
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  return <section><p className="text-xs font-mono tracking-widest text-[#cf9f5d]">SETTINGS</p><h2 className="font-display text-3xl mt-4">Your event, configured.</h2>
    <form className="mt-8 grid sm:grid-cols-2 gap-5" aria-label="Event settings" onSubmit={async e => {
      e.preventDefault(); const data = new FormData(e.currentTarget); setBusy(true); setNotice('');
      try { await write(`/api/organiser/events/${context.event.id}/config`, token, { title: data.get('title'), location: data.get('location'), visibility: data.get('visibility'), applicationStatus: data.get('applicationStatus'), status: data.get('status'), categories: String(data.get('categories')).split(',').map(c => c.trim()).filter(Boolean), venuePublished: data.get('venuePublished') === 'on' }, 'PATCH'); await onSaved(); setNotice('Settings saved.'); }
      catch (error: any) { setNotice(error.message); } finally { setBusy(false); }
    }}>
      <label className={label}>Event title<input name="title" defaultValue={context.event.title} required minLength={3} maxLength={160} className={field} /></label>
      <label className={label}>Location<input name="location" defaultValue={context.event.location} required minLength={2} maxLength={140} className={field} /></label>
      <label className={label}>Visibility<select name="visibility" defaultValue={context.event.visibility} className={field}><option>PUBLIC</option><option>UNLISTED</option><option>PRIVATE</option></select></label>
      <label className={label}>Applications<select name="applicationStatus" defaultValue={context.event.applicationStatus} className={field}><option>OPEN</option><option>CLOSED</option><option>COMING_SOON</option></select></label>
      <label className={label}>Event status<select name="status" defaultValue={context.event.status} className={field}>{['DRAFT','PUBLISHED','LIVE','ARCHIVED'].map(s => <option key={s}>{s}</option>)}</select></label>
      <label className={label}>Application categories (comma separated)<input name="categories" defaultValue={context.event.categories.join(', ')} className={field} /></label>
      <label className="text-sm text-[#edd2ab] flex items-center gap-3"><input type="checkbox" name="venuePublished" defaultChecked={context.event.venuePublished} />Publish venue to accepted participants</label>
      <button disabled={busy} className="auv-btn auv-btn-primary justify-self-start">{busy ? 'Saving…' : 'Save settings'}</button>
    </form>{notice && <p className="mt-5 text-sm text-[#edd2ab]" role="status">{notice}</p>}
  </section>;
}

export function AutomationsPrototype() {
  const [days, setDays] = useState(2);
  return <section><p className="text-xs font-mono tracking-widest text-[#cf9f5d]">AUVRESENCE AUTOMATIONS · COMING SOON</p><h2 className="font-display text-3xl mt-4">A thoughtful welcome.</h2>
    <p className="mt-5 text-[#edd2ab]">PROTOTYPE · No emails are currently sent.</p>
    <ol className="mt-8 divide-y divide-[#cf9f5d]/20 border-y border-[#cf9f5d]/20">
      <li className="py-6"><span className="text-xs text-[#cf9f5d]">TRIGGER</span><p className="mt-2">Application accepted</p></li>
      <li className="py-6"><span className="text-xs text-[#cf9f5d]">ACTION · CONCEPT</span><p className="mt-2">Acceptance Email</p></li>
      <li className="py-6"><label className={label}>WAIT · LOCAL PREVIEW ONLY<input aria-label="Prototype wait days" type="number" min={1} max={30} value={days} onChange={e => setDays(Math.max(1, Math.min(30, Number(e.target.value) || 1)))} className={field + ' max-w-28'} /> days</label></li>
      <li className="py-6"><span className="text-xs text-[#cf9f5d]">ACTION · CONCEPT</span><p className="mt-2">Preparation Guide</p></li>
    </ol><p className="mt-5 text-xs text-[#faf6f0]/60">Changes only preview this concept in this screen. No workflow is saved or scheduled.</p>
    <button type="button" disabled className="auv-btn auv-btn-secondary mt-6 opacity-50">Enable automation · Coming soon</button>
  </section>;
}
