export interface AuthorisedParticipantAIContext {
  participantName: string;
  participantRole: string;
  applicationStatus: string;
  credentialCode: string | null;
  credentialStatus: string | null;
  eventTitle: string;
  eventDates: string;
  eventLocation: string;
  happeningNow: {
    title: string;
    startTime: string;
    endTime: string;
    venueName: string | null;
    venueFloor: string | null;
    venueZone: string | null;
    lastUpdatedNote: string | null;
  } | null;
  upNext: {
    title: string;
    startTime: string;
    endTime: string;
    venueName: string | null;
    venueFloor: string | null;
    venueZone: string | null;
    lastUpdatedNote: string | null;
  } | null;
  schedule: Array<{
    title: string;
    startTime: string;
    endTime: string;
    venueName: string | null;
    venueFloor: string | null;
    venueZone: string | null;
    status: string;
    lastUpdatedNote: string | null;
  }>;
  announcements: Array<{
    title: string;
    body: string;
    audience: string;
    priority: string;
  }>;
  resources: Array<{
    title: string;
    category: string;
    description: string;
  }>;
  waypointTrail: Array<{
    venueName: string;
    scannedAt: string;
  }>;
  venueDirectory?: Array<{
    name: string;
    floor: string;
    zone: string;
    poiType: string;
    poiCategory: string;
    operationalStatus: string;
    accessible: boolean;
  }>;
  recommendedRouteToNextSession?: {
    fromLocation: string;
    toLocation: string;
    standardRouteSummary: string;
    stepFreeRouteSummary: string;
  } | null;
}

export interface AuthorisedAiInput {
  systemInstruction: string;
  prompt: string;
  maxTokens?: number;
}

export interface AiResponse {
  text: string;
  provider: string;
  model: string;
  usedFallbackModel?: boolean;
}

export interface AiAnswerResult {
  answer: string;
  provider: string;
  model: string;
  contextTimestamp: string;
}

export interface AiBriefingResult {
  briefing: string;
  provider: string;
  model: string;
  contextTimestamp: string;
  isDeterministicFallback: boolean;
}

export interface TextAiProvider {
  chat(input: AuthorisedAiInput): Promise<AiResponse>;

  answerParticipantQuestion(
    question: string,
    context: AuthorisedParticipantAIContext
  ): Promise<AiAnswerResult>;

  generateBriefing(
    context: AuthorisedParticipantAIContext
  ): Promise<AiBriefingResult>;
}

// Keep alias for V2 compatibility
export type AiProvider = TextAiProvider;

export interface SpeechToTextProvider {
  transcribe(input: {
    audioBase64: string;
    mimeType?: string;
  }): Promise<{ text: string }>;
}

export interface TextToSpeechProvider {
  speak(input: {
    text: string;
  }): Promise<{ audioBase64: string; mimeType: string }>;
}

export interface VisionProvider {
  analyse(input: {
    imageDataUrl: string;
    question: string;
    context: AuthorisedParticipantAIContext;
  }): Promise<{ answer: string }>;
}

export interface EmbeddingProvider {
  embed(input: { text: string }): Promise<{ embedding: number[] }>;
}

export class AiNotConfiguredError extends Error {
  public readonly code = 'AI_NOT_CONFIGURED';
  constructor(message = 'AI_NOT_CONFIGURED') {
    super(message);
    this.name = 'AiNotConfiguredError';
  }
}

export class VoiceNotConfiguredError extends Error {
  public readonly code = 'VOICE_NOT_CONFIGURED';
  constructor(message = 'VOICE_NOT_CONFIGURED') {
    super(message);
    this.name = 'VoiceNotConfiguredError';
  }
}

export class VisionNotConfiguredError extends Error {
  public readonly code = 'VISION_NOT_CONFIGURED';
  constructor(message = 'VISION_NOT_CONFIGURED') {
    super(message);
    this.name = 'VisionNotConfiguredError';
  }
}

export function isAiConfigured(): boolean {
  const provider = process.env.AI_PROVIDER?.trim().toLowerCase();
  const model = process.env.AI_MODEL?.trim();
  if (!provider || !model) return false;

  if (provider === 'unorouter') {
    const key = process.env.UNOROUTER_API_KEY?.trim();
    return Boolean(key && key.length > 0 && key !== 'MY_UNOROUTER_API_KEY');
  }

  if (provider === 'gemini') {
    const key = process.env.GEMINI_API_KEY?.trim();
    return Boolean(key && key.length > 0 && key !== 'MY_GEMINI_API_KEY');
  }

  return false;
}

export function isSttConfigured(): boolean {
  const provider = (process.env.STT_PROVIDER || 'groq').trim().toLowerCase();
  const model = process.env.STT_MODEL?.trim();
  const key = process.env.GROQ_API_KEY?.trim();
  return Boolean(
    provider === 'groq' &&
      model &&
      model.length > 0 &&
      key &&
      key.length > 0 &&
      key !== 'MY_GROQ_API_KEY'
  );
}

export function isTtsConfigured(): boolean {
  const provider = (process.env.TTS_PROVIDER || 'groq').trim().toLowerCase();
  const model = process.env.TTS_MODEL?.trim();
  const key = process.env.GROQ_API_KEY?.trim();
  return Boolean(
    provider === 'groq' &&
      model &&
      model.length > 0 &&
      key &&
      key.length > 0 &&
      key !== 'MY_GROQ_API_KEY'
  );
}

export function isVoiceConfigured(): boolean {
  return isSttConfigured() || isTtsConfigured();
}

export function isVisionConfigured(): boolean {
  const provider = (process.env.VISION_PROVIDER || 'huggingface')
    .trim()
    .toLowerCase();
  const model = process.env.VISION_MODEL?.trim();
  const token = process.env.HF_TOKEN?.trim();
  return Boolean(
    provider === 'huggingface' &&
      model &&
      model.length > 0 &&
      token &&
      token.length > 0 &&
      token !== 'MY_HF_TOKEN'
  );
}

export function buildParticipantQuestionPrompts(
  question: string,
  context: AuthorisedParticipantAIContext
): { systemInstruction: string; prompt: string } {
  const systemInstruction = `You are Auvresence, the context-aware event intelligence layer for the Auvresence ecosystem.
You are assisting an authenticated participant: ${context.participantName}.
CRITICAL RULES:
1. Base every answer strictly on the AUTHORISED SERVER CONTEXT JSON provided below.
2. Never invent sessions, venues, room numbers, speakers, or announcements that are not in the context.
3. If a session's venue was updated (see lastUpdatedNote or venueName in upNext / schedule), explicitly highlight the current venue name, floor, and zone so the participant goes to the right place.
4. Keep responses concise, articulate, and structured (2 to 4 sentences).
5. Never mention underlying AI model names or provider internals.
6. You do not have access to any other participant's private application data or organiser-only notes because the server enforces authorization before building your context.`;

  const prompt = `AUTHORISED SERVER CONTEXT (PostgreSQL Snapshot at ${new Date().toISOString()}):
${JSON.stringify(context, null, 2)}

PARTICIPANT QUESTION:
"${question}"

Provide a direct, accurate response grounded in the authorised server context above:`;

  return { systemInstruction, prompt };
}

export function buildBriefingPrompts(
  context: AuthorisedParticipantAIContext
): { systemInstruction: string; prompt: string } {
  const systemInstruction = `You are Auvresence generating a concise executive briefing ("Brief Me") for an authenticated event participant.
Write a crisp, high-signal 4-to-5 line briefing covering:
1. Greeting by first name (${context.participantName.split(' ')[0]}) and current credential/application status (${context.applicationStatus}).
2. Number of remaining activities today and what is Happening Now.
3. What is Up Next (including exact time, venue name, floor, zone, and any location update note).
4. Summary of the latest authorised organiser announcement.
Do not use markdown headers, bullet symbols, or provider names. Keep it calm, institutional, and immediately actionable.`;

  const prompt = `AUTHORISED SERVER CONTEXT:
${JSON.stringify(context, null, 2)}

Generate the participant's live executive briefing now:`;

  return { systemInstruction, prompt };
}

export function buildDeterministicFallbackBriefing(
  context: AuthorisedParticipantAIContext
): AiBriefingResult {
  const firstName = context.participantName.split(' ')[0] || 'Participant';
  const credLine =
    context.credentialStatus === 'ACTIVE'
      ? `Your credential (${context.credentialCode}) is active.`
      : `Your application status is currently ${context.applicationStatus.replace('_', ' ')}.`;

  const remainingCount = context.schedule.filter(
    (s) => s.status !== 'COMPLETED'
  ).length;

  const nextLine = context.upNext
    ? `Your next session (${context.upNext.title}) begins at ${context.upNext.startTime} in ${context.upNext.venueName || 'a location to be announced'}${context.upNext.venueFloor ? ` (${context.upNext.venueFloor}${context.upNext.venueZone ? ` · ${context.upNext.venueZone}` : ''})` : ''}.${
        context.upNext.lastUpdatedNote
          ? ` ${context.upNext.lastUpdatedNote}.`
          : ''
      }`
    : context.happeningNow
    ? `Currently in progress: ${context.happeningNow.title} in ${context.happeningNow.venueName || 'a location to be announced'}.`
    : 'No additional sessions are scheduled for today.';

  const importantCount = context.announcements.filter(
    (a) => a.priority === 'IMPORTANT'
  ).length;
  const updateLine =
    importantCount > 0
      ? `${importantCount} important organiser update${
          importantCount > 1 ? 's were' : ' was'
        } published: ${context.announcements[0].title}.`
      : context.announcements.length > 0
      ? `${context.announcements.length} organiser update${
          context.announcements.length > 1 ? 's are' : ' is'
        } available.`
      : 'No organiser updates have been published yet.';

  const briefing = [
    `Good day, ${firstName}.`,
    `You have ${remainingCount} scheduled activit${
      remainingCount === 1 ? 'y' : 'ies'
    } remaining today.`,
    nextLine,
    credLine,
    updateLine,
  ].join('\n\n');

  return {
    briefing,
    provider: 'server-state',
    model: 'deterministic-event-briefing',
    contextTimestamp: new Date().toISOString(),
    isDeterministicFallback: true,
  };
}
