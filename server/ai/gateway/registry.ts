// Provider registry: one adapter per provider. Adding a provider =
// one adapter file + one line here.

import { anthropicAdapter } from "./adapters/anthropic";
import { elevenlabsAdapter } from "./adapters/elevenlabs";
import { geminiAdapter } from "./adapters/gemini";
import { openaiAdapter } from "./adapters/openai";
import type { AIHubProvider, ProviderAdapter } from "./types";

const adapters = new Map<AIHubProvider, ProviderAdapter>([
  ["openai", openaiAdapter],
  ["anthropic", anthropicAdapter],
  ["gemini", geminiAdapter],
  ["elevenlabs", elevenlabsAdapter],
]);

export function getAdapter(provider: AIHubProvider): ProviderAdapter | undefined {
  return adapters.get(provider);
}

export function listAdapters(): ProviderAdapter[] {
  return Array.from(adapters.values());
}
