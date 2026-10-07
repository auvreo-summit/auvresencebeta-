import type { AuthorisedParticipantAIContext } from './ai-provider.ts';

/** Answers only from the server-authorised event snapshot; ambiguity goes to AI. */
export function answerEventQuestion(question: string, context: AuthorisedParticipantAIContext): string | null {
  const q = question.toLowerCase().replace(/[’]/g, "'");
  const location = (s: NonNullable<typeof context.upNext>) => s.venueName ? `${s.venueName}${s.venueFloor ? ` · ${s.venueFloor}` : ''}` : 'Location to be announced';
  if (/\b(next|where do i go)\b/.test(q) && !/\b(move|change|plan)\b/.test(q)) {
    const s = context.upNext;
    return s ? `${s.title}\n${s.startTime}–${s.endTime}\n${location(s)}${s.lastUpdatedNote ? `\n${s.lastUpdatedNote}` : ''}` : 'Nothing is scheduled next. Check the programme for future moments.';
  }
  if (/\b(happening now|on now|right now)\b/.test(q)) {
    const s = context.happeningNow;
    return s ? `${s.title}\n${s.startTime}–${s.endTime}\n${location(s)}` : 'No moment is currently marked as happening.';
  }
  if (/\b(what changed|what has changed|recent updates)\b/.test(q)) {
    const changed = context.schedule.filter(s => s.lastUpdatedNote);
    return changed.length ? changed.map(s => `${s.title}: ${s.lastUpdatedNote}`).join('\n') : 'No programme changes have been published.';
  }
  const types = /\b(food|eat|dining|cafe)\b/.test(q) ? ['FOOD','CAFE'] : /\b(washroom|toilet|restroom)\b/.test(q) ? ['WASHROOM'] : /\b(medical|first aid)\b/.test(q) ? ['MEDICAL'] : /\b(lift|elevator)\b/.test(q) ? ['LIFT'] : null;
  if (types && /\b(where|find|show|nearest)\b/.test(q)) {
    const places = (context.venueDirectory || []).filter(v => types.includes(v.poiType));
    return places.length ? places.map(v => `${v.name}\n${v.floor}${v.operationalStatus !== 'OPEN' ? '\nCurrently unavailable' : ''}`).join('\n\n') : 'Your organiser hasn’t mapped a matching place yet. Ask the event team for help.';
  }
  return null;
}
