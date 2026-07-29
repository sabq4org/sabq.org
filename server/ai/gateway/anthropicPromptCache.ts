// Anthropic prompt-caching helpers — pure (unit-tested without SDK).
//
// Strategy for Sabq:
// 1) Explicit breakpoint on the static system prompt (editorial core, tools
//    instructions, etc.) so single-turn calls with a varying user message
//    still hit cache on the expensive prefix.
// 2) Automatic top-level caching only for multi-turn chats (assistant turns
//    present), so the growing conversation prefix is cached without putting
//    the breakpoint on a one-shot user message that changes every request.

export const CACHE_READ_MULTIPLIER = 0.1;
export const CACHE_WRITE_5M_MULTIPLIER = 1.25;

export type EphemeralCacheControl = { type: "ephemeral"; ttl?: "5m" | "1h" };

export interface AnthropicSystemTextBlock {
  type: "text";
  text: string;
  cache_control?: EphemeralCacheControl;
}

/** Off via ANTHROPIC_PROMPT_CACHE / AI_ANTHROPIC_PROMPT_CACHE = 0|false|off|no */
export function isAnthropicPromptCachingEnabled(
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  const raw = env.ANTHROPIC_PROMPT_CACHE ?? env.AI_ANTHROPIC_PROMPT_CACHE ?? "on";
  return !["0", "false", "off", "no"].includes(String(raw).trim().toLowerCase());
}

export function buildCachedSystemBlocks(
  systemText: string,
  enabled: boolean,
): AnthropicSystemTextBlock[] {
  const block: AnthropicSystemTextBlock = {
    type: "text",
    text: systemText,
  };
  if (enabled && systemText.trim().length > 0) {
    block.cache_control = { type: "ephemeral" };
  }
  return [block];
}

/** Multi-turn = at least one prior assistant turn in the chat payload. */
export function shouldCacheGrowingConversation(
  messages: Array<{ role: string }>,
  enabled: boolean,
): boolean {
  return enabled && messages.some((m) => m.role === "assistant");
}

export type AnthropicChatMessage = {
  role: "user" | "assistant";
  content: string | AnthropicSystemTextBlock[];
};

/**
 * Place an explicit cache breakpoint on the final text block of the last
 * message. Used for multi-turn chats (SDK 0.68 has no top-level automatic
 * `cache_control` on MessageCreateParams).
 */
export function withTrailingMessageCacheBreakpoint(
  messages: Array<{ role: "user" | "assistant"; content: string }>,
  enabled: boolean,
): AnthropicChatMessage[] {
  if (!enabled || messages.length === 0) return messages;
  const last = messages[messages.length - 1]!;
  return [
    ...messages.slice(0, -1),
    {
      role: last.role,
      content: [
        {
          type: "text",
          text: last.content,
          cache_control: { type: "ephemeral" },
        },
      ],
    },
  ];
}

export interface AnthropicUsageLike {
  input_tokens?: number | null;
  output_tokens?: number | null;
  cache_read_input_tokens?: number | null;
  cache_creation_input_tokens?: number | null;
}

export interface NormalizedAnthropicUsage {
  /** Total input tokens processed (read + write + uncached). */
  inputTokens: number;
  outputTokens: number;
  cacheReadInputTokens: number;
  cacheCreationInputTokens: number;
  /** Tokens after the last cache breakpoint (Anthropic's input_tokens). */
  uncachedInputTokens: number;
}

export function normalizeAnthropicUsage(usage: AnthropicUsageLike | undefined | null): NormalizedAnthropicUsage {
  const cacheReadInputTokens = usage?.cache_read_input_tokens ?? 0;
  const cacheCreationInputTokens = usage?.cache_creation_input_tokens ?? 0;
  const uncachedInputTokens = usage?.input_tokens ?? 0;
  return {
    inputTokens: cacheReadInputTokens + cacheCreationInputTokens + uncachedInputTokens,
    outputTokens: usage?.output_tokens ?? 0,
    cacheReadInputTokens,
    cacheCreationInputTokens,
    uncachedInputTokens,
  };
}
