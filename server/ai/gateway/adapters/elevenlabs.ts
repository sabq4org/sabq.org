// ElevenLabs adapter: TTS only. Wraps the existing ElevenLabsService (voice
// catalog, retry, and voice-settings logic stay in services/elevenlabs.ts).

import { getElevenLabsService, isElevenLabsConfigured } from "../../../services/elevenlabs";
import { AIGatewayError, type AdapterTTSParams, type AdapterTTSResult, type ProviderAdapter } from "../types";

export const elevenlabsAdapter: ProviderAdapter = {
  provider: "elevenlabs",

  isConfigured(): boolean {
    return isElevenLabsConfigured();
  },

  async tts(modelId: string, params: AdapterTTSParams): Promise<AdapterTTSResult> {
    const service = getElevenLabsService();
    if (!service) {
      throw new AIGatewayError("ElevenLabs API key not configured", {
        code: "AUTH_ERROR",
        provider: "elevenlabs",
        modelId,
      });
    }

    const audio = await service.textToSpeech(
      {
        text: params.text,
        voiceId: params.voice,
        model: modelId,
      },
      params.timeoutMs,
      params.signal,
    );

    return {
      audio,
      contentType: "audio/mpeg",
      charCount: params.text.length,
    };
  },
};
