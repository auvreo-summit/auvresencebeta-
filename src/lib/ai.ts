import {
  AiNotConfiguredError,
  VisionNotConfiguredError,
  VoiceNotConfiguredError,
  buildParticipantQuestionPrompts,
  buildDeterministicFallbackBriefing,
  isAiConfigured,
  isSttConfigured,
  isTtsConfigured,
  isVisionConfigured,
  isVoiceConfigured,
  type AuthorisedAiInput,
  type AiResponse,
  type AiAnswerResult,
  type AiBriefingResult,
  type AuthorisedParticipantAIContext,
  type SpeechToTextProvider,
  type TextAiProvider,
  type TextToSpeechProvider,
  type VisionProvider,
} from './ai-provider.ts';
import { GeminiAiProvider } from './gemini-provider.ts';
import { UnoRouterTextProvider } from './unorouter-provider.ts';
import {
  GroqSpeechToTextProvider,
  GroqTextToSpeechProvider,
  HuggingFaceVisionProvider,
} from './voice-vision-providers.ts';

const unoRouterProvider = new UnoRouterTextProvider();
const geminiProvider = new GeminiAiProvider();
const sttProvider: SpeechToTextProvider = new GroqSpeechToTextProvider();
const ttsProvider: TextToSpeechProvider = new GroqTextToSpeechProvider();
const visionProvider: VisionProvider = new HuggingFaceVisionProvider();

function resolveActiveTextProvider(): TextAiProvider {
  const provider = (process.env.AI_PROVIDER || 'unorouter').trim().toLowerCase();
  if (provider === 'unorouter') {
    return unoRouterProvider;
  }
  if (provider === 'gemini') {
    return geminiProvider;
  }
  throw new AiNotConfiguredError('AI_NOT_CONFIGURED');
}

export {
  AiNotConfiguredError,
  VoiceNotConfiguredError,
  VisionNotConfiguredError,
  buildDeterministicFallbackBriefing,
  isAiConfigured,
  isSttConfigured,
  isTtsConfigured,
  isVoiceConfigured,
  isVisionConfigured,
  type AuthorisedParticipantAIContext,
  type AiAnswerResult,
  type AiBriefingResult,
};

export async function generateAskAuvresenceResponse(
  question: string,
  context: AuthorisedParticipantAIContext
): Promise<AiAnswerResult> {
  const { systemInstruction, prompt } = buildParticipantQuestionPrompts(question, context);
  const result = await generatePlatformResponse({ systemInstruction, prompt, maxTokens: 320 });
  return { answer: result.text, provider: result.provider, model: result.model, contextTimestamp: new Date().toISOString() };
}

export async function generateParticipantBriefing(
  context: AuthorisedParticipantAIContext
): Promise<AiBriefingResult> {
  return resolveActiveTextProvider().generateBriefing(context);
}

export async function transcribeParticipantSpeech(input: {
  audioBase64: string;
  mimeType?: string;
}): Promise<{ text: string }> {
  return sttProvider.transcribe(input);
}

export async function synthesiseAuvresenceSpeech(input: {
  text: string;
}): Promise<{ audioBase64: string; mimeType: string }> {
  return ttsProvider.speak(input);
}

export async function analyseParticipantEventImage(input: {
  imageDataUrl: string;
  question: string;
  context: AuthorisedParticipantAIContext;
}): Promise<{ answer: string }> {
  return visionProvider.analyse(input);
}

/** Each provider uses its own server-only credentials. Fallback is explicit. */
export async function generatePlatformResponse(input: AuthorisedAiInput): Promise<AiResponse> {
  try { return await resolveActiveTextProvider().chat(input); }
  catch (primaryError) {
    const fallback = process.env.AI_FALLBACK_PROVIDER?.trim().toLowerCase();
    const primary = (process.env.AI_PROVIDER || 'unorouter').trim().toLowerCase();
    if (!fallback || fallback === primary) throw primaryError;
    if (fallback === 'gemini' && process.env.GEMINI_API_KEY) {
      return await new GeminiAiProvider('gemini', process.env.AI_FALLBACK_PROVIDER_MODEL || 'gemini-2.5-flash').chat(input);
    }
    if (fallback === 'unorouter' && process.env.UNOROUTER_API_KEY) {
      return await new UnoRouterTextProvider('unorouter', process.env.AI_FALLBACK_PROVIDER_MODEL || 'gpt-oss-20b:free').chat(input);
    }
    throw primaryError;
  }
}
