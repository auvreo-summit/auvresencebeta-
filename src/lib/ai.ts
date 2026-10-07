import {
  AiNotConfiguredError,
  VisionNotConfiguredError,
  VoiceNotConfiguredError,
  buildDeterministicFallbackBriefing,
  isAiConfigured,
  isSttConfigured,
  isTtsConfigured,
  isVisionConfigured,
  isVoiceConfigured,
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
  const provider = process.env.AI_PROVIDER?.trim().toLowerCase();
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
  return resolveActiveTextProvider().answerParticipantQuestion(question, context);
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
