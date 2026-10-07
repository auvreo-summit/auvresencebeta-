import {
  AiNotConfiguredError,
  buildBriefingPrompts,
  buildParticipantQuestionPrompts,
  type AiAnswerResult,
  type AiBriefingResult,
  type AiResponse,
  type AuthorisedAiInput,
  type AuthorisedParticipantAIContext,
  type EmbeddingProvider,
  type TextAiProvider,
} from './ai-provider.ts';

const REQUEST_TIMEOUT_MS = 14000;

export class UnoRouterTextProvider implements TextAiProvider {
  private getConfig() {
    const provider = process.env.AI_PROVIDER?.trim().toLowerCase();
    const baseUrl = (
      process.env.UNOROUTER_BASE_URL || 'https://api.unorouter.com/v1'
    )
      .trim()
      .replace(/\/+$/, '');
    const apiKey = process.env.UNOROUTER_API_KEY?.trim();
    const model = process.env.AI_MODEL?.trim();
    const fallbackModel = process.env.AI_FALLBACK_MODEL?.trim() || undefined;

    if (
      provider !== 'unorouter' ||
      !apiKey ||
      apiKey === 'MY_UNOROUTER_API_KEY' ||
      !model
    ) {
      throw new AiNotConfiguredError('AI_NOT_CONFIGURED');
    }

    return {
      baseUrl,
      apiKey,
      model,
      fallbackModel,
    };
  }

  private async callChatCompletion(
    baseUrl: string,
    apiKey: string,
    modelToUse: string,
    input: AuthorisedAiInput
  ): Promise<string> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    try {
      const res = await fetch(`${baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: modelToUse,
          messages: [
            { role: 'system', content: input.systemInstruction },
            { role: 'user', content: input.prompt },
          ],
          temperature: 0.2,
          max_tokens: input.maxTokens || 350,
        }),
        signal: controller.signal,
      });

      if (!res.ok) {
        throw new Error(`UnoRouter HTTP ${res.status}`);
      }

      const data: any = await res.json();
      const text = data?.choices?.[0]?.message?.content?.trim();
      if (!text) {
        throw new Error('Empty completion from UnoRouter.');
      }
      return text;
    } finally {
      clearTimeout(timer);
    }
  }

  async chat(input: AuthorisedAiInput): Promise<AiResponse> {
    const { baseUrl, apiKey, model, fallbackModel } = this.getConfig();

    try {
      const text = await this.callChatCompletion(baseUrl, apiKey, model, input);
      return {
        text,
        provider: 'unorouter',
        model,
        usedFallbackModel: false,
      };
    } catch (primaryError) {
      if (fallbackModel && fallbackModel !== model) {
        const fallbackText = await this.callChatCompletion(
          baseUrl,
          apiKey,
          fallbackModel,
          input
        );
        return {
          text: fallbackText,
          provider: 'unorouter',
          model: fallbackModel,
          usedFallbackModel: true,
        };
      }
      throw primaryError;
    }
  }

  async answerParticipantQuestion(
    question: string,
    context: AuthorisedParticipantAIContext
  ): Promise<AiAnswerResult> {
    const { systemInstruction, prompt } = buildParticipantQuestionPrompts(
      question,
      context
    );
    const res = await this.chat({
      systemInstruction,
      prompt,
      maxTokens: 320,
    });
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
    const res = await this.chat({
      systemInstruction,
      prompt,
      maxTokens: 280,
    });
    return {
      briefing: res.text,
      provider: res.provider,
      model: res.model,
      contextTimestamp: new Date().toISOString(),
      isDeterministicFallback: false,
    };
  }
}

export class UnoRouterEmbeddingProvider implements EmbeddingProvider {
  async embed(input: { text: string }): Promise<{ embedding: number[] }> {
    const provider = process.env.EMBEDDING_PROVIDER?.trim().toLowerCase();
    const model = process.env.EMBEDDING_MODEL?.trim();
    const apiKey = process.env.UNOROUTER_API_KEY?.trim();
    const baseUrl = (
      process.env.UNOROUTER_BASE_URL || 'https://api.unorouter.com/v1'
    )
      .trim()
      .replace(/\/+$/, '');

    if (provider !== 'unorouter' || !model || !apiKey) {
      throw new AiNotConfiguredError('EMBEDDING_NOT_CONFIGURED');
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 10000);
    try {
      const res = await fetch(`${baseUrl}/embeddings`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model,
          input: input.text,
        }),
        signal: controller.signal,
      });
      if (!res.ok) {
        throw new Error(`Embedding request failed (${res.status})`);
      }
      const data: any = await res.json();
      const vec = data?.data?.[0]?.embedding;
      if (!Array.isArray(vec)) {
        throw new Error('Invalid embedding payload');
      }
      return { embedding: vec };
    } finally {
      clearTimeout(timer);
    }
  }
}
