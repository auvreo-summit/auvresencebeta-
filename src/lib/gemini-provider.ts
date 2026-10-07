import { GoogleGenAI } from '@google/genai';
import {
  AiNotConfiguredError,
  buildBriefingPrompts,
  buildParticipantQuestionPrompts,
  type AiAnswerResult,
  type AiBriefingResult,
  type AiResponse,
  type AuthorisedAiInput,
  type AuthorisedParticipantAIContext,
  type TextAiProvider,
} from './ai-provider.ts';

export class GeminiAiProvider implements TextAiProvider {
  constructor(private providerOverride?: string, private modelOverride?: string) {}
  private getVerifiedConfig(): {
    provider: string;
    model: string;
    apiKey: string;
  } {
    const provider = this.providerOverride || process.env.AI_PROVIDER?.trim().toLowerCase();
    const model = this.modelOverride || process.env.AI_MODEL?.trim();
    const apiKey = process.env.GEMINI_API_KEY?.trim();

    if (
      provider !== 'gemini' ||
      !model ||
      !apiKey ||
      apiKey === 'MY_GEMINI_API_KEY'
    ) {
      throw new AiNotConfiguredError('AI_NOT_CONFIGURED');
    }

    return {
      provider: 'gemini',
      model,
      apiKey,
    };
  }

  private createClient(apiKey: string): GoogleGenAI {
    return new GoogleGenAI({
      apiKey,
      httpOptions: {
        timeout: 14000,
        headers: {
          'User-Agent': 'aistudio-build',
        },
      },
    });
  }

  async chat(input: AuthorisedAiInput): Promise<AiResponse> {
    const { provider, model, apiKey } = this.getVerifiedConfig();
    const ai = this.createClient(apiKey);

    const response = await ai.models.generateContent({
      model,
      contents: input.prompt,
      config: {
        systemInstruction: input.systemInstruction,
        temperature: 0.2,
        maxOutputTokens: input.maxTokens || 350,
      },
    });

    const text = response.text?.trim();
    if (!text) {
      throw new Error('Empty response from AI provider.');
    }

    return {
      text,
      provider,
      model,
      usedFallbackModel: false,
    };
  }

  async answerParticipantQuestion(
    question: string,
    context: AuthorisedParticipantAIContext
  ): Promise<AiAnswerResult> {
    const { systemInstruction, prompt } = buildParticipantQuestionPrompts(
      question,
      context
    );
    const res = await this.chat({ systemInstruction, prompt });
    return {
      answer: res.text,
      provider: res.provider,
      model: res.model,
      contextTimestamp: new Date().toISOString(),
    };
  }

  async generateBriefing(
    context: AuthorisedParticipantAIContext
  ): Promise<AiBriefingResult> {
    const { systemInstruction, prompt } = buildBriefingPrompts(context);
    const res = await this.chat({ systemInstruction, prompt });
    return {
      briefing: res.text,
      provider: res.provider,
      model: res.model,
      contextTimestamp: new Date().toISOString(),
      isDeterministicFallback: false,
    };
  }
}
