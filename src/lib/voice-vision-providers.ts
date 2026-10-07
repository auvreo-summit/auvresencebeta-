import {
  VisionNotConfiguredError,
  VoiceNotConfiguredError,
  isSttConfigured,
  isTtsConfigured,
  isVisionConfigured,
  type AuthorisedParticipantAIContext,
  type SpeechToTextProvider,
  type TextToSpeechProvider,
  type VisionProvider,
} from './ai-provider.ts';

const VOICE_TIMEOUT_MS = 14000;
const VISION_TIMEOUT_MS = 16000;

export class GroqSpeechToTextProvider implements SpeechToTextProvider {
  async transcribe(input: {
    audioBase64: string;
    mimeType?: string;
  }): Promise<{ text: string }> {
    if (!isSttConfigured()) {
      throw new VoiceNotConfiguredError('VOICE_NOT_CONFIGURED');
    }

    const apiKey = process.env.GROQ_API_KEY!.trim();
    const model = process.env.STT_MODEL!.trim();

    const cleanBase64 = input.audioBase64.includes(',')
      ? input.audioBase64.split(',')[1]
      : input.audioBase64;
    const binary = Buffer.from(cleanBase64, 'base64');
    const mimeType = input.mimeType || 'audio/webm';
    const ext = mimeType.includes('mp4')
      ? 'mp4'
      : mimeType.includes('wav')
      ? 'wav'
      : 'webm';

    const formData = new FormData();
    const blob = new Blob([binary], { type: mimeType });
    formData.append('file', blob, `speech.${ext}`);
    formData.append('model', model);
    formData.append('response_format', 'json');

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), VOICE_TIMEOUT_MS);

    try {
      const res = await fetch(
        'https://api.groq.com/openai/v1/audio/transcriptions',
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${apiKey}`,
          },
          body: formData,
          signal: controller.signal,
        }
      );

      if (!res.ok) {
        throw new Error(`STT provider returned HTTP ${res.status}`);
      }

      const data: any = await res.json();
      const text = data?.text?.trim();
      if (!text) {
        throw new Error('No speech recognized.');
      }

      return { text };
    } finally {
      clearTimeout(timer);
    }
  }
}

export class GroqTextToSpeechProvider implements TextToSpeechProvider {
  async speak(input: {
    text: string;
  }): Promise<{ audioBase64: string; mimeType: string }> {
    if (!isTtsConfigured()) {
      throw new VoiceNotConfiguredError('VOICE_NOT_CONFIGURED');
    }

    const apiKey = process.env.GROQ_API_KEY!.trim();
    const model = process.env.TTS_MODEL!.trim();
    const voice = process.env.TTS_VOICE?.trim() || 'autumn';

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), VOICE_TIMEOUT_MS);

    try {
      const res = await fetch('https://api.groq.com/openai/v1/audio/speech', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model,
          input: input.text.slice(0, 900),
          voice,
          response_format: 'wav',
        }),
        signal: controller.signal,
      });

      if (!res.ok) {
        throw new Error(`TTS provider returned HTTP ${res.status}`);
      }

      const arrayBuffer = await res.arrayBuffer();
      const audioBase64 = Buffer.from(arrayBuffer).toString('base64');
      return {
        audioBase64,
        mimeType: 'audio/wav',
      };
    } finally {
      clearTimeout(timer);
    }
  }
}

export class HuggingFaceVisionProvider implements VisionProvider {
  async analyse(input: {
    imageDataUrl: string;
    question: string;
    context: AuthorisedParticipantAIContext;
  }): Promise<{ answer: string }> {
    if (!isVisionConfigured()) {
      throw new VisionNotConfiguredError('VISION_NOT_CONFIGURED');
    }

    const baseUrl = (
      process.env.VISION_BASE_URL || 'https://router.huggingface.co/v1'
    )
      .trim()
      .replace(/\/+$/, '');
    const model = process.env.VISION_MODEL!.trim();
    const token = process.env.HF_TOKEN!.trim();

    const systemPrompt = `You are Auvresence Vision, assisting participant ${input.context.participantName} at ${input.context.eventTitle}.
Interpret the provided event-related image (such as a room sign, event notice, or schedule board) and cross-reference it with the participant's authorised event state:
- Happening Now: ${
      input.context.happeningNow
        ? `${input.context.happeningNow.title} in ${input.context.happeningNow.venueName}`
        : 'None'
    }
- Up Next: ${
      input.context.upNext
        ? `${input.context.upNext.title} at ${input.context.upNext.startTime} in ${input.context.upNext.venueName} (${input.context.upNext.venueFloor})`
        : 'None'
    }
Keep your answer concise (2-4 sentences), helpful, and never mention model or provider names.`;

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), VISION_TIMEOUT_MS);

    try {
      const res = await fetch(`${baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          model,
          messages: [
            { role: 'system', content: systemPrompt },
            {
              role: 'user',
              content: [
                {
                  type: 'text',
                  text:
                    input.question ||
                    'Summarise this event notice and how it relates to my schedule.',
                },
                {
                  type: 'image_url',
                  image_url: {
                    url: input.imageDataUrl,
                  },
                },
              ],
            },
          ],
          max_tokens: 300,
          temperature: 0.2,
        }),
        signal: controller.signal,
      });

      if (!res.ok) {
        throw new Error(`Vision provider returned HTTP ${res.status}`);
      }

      const data: any = await res.json();
      const answer = data?.choices?.[0]?.message?.content?.trim();
      if (!answer) {
        throw new Error('Empty vision response');
      }

      return { answer };
    } finally {
      clearTimeout(timer);
    }
  }
}
