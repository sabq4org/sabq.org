import { z } from "zod";

/**
 * Personal credentials for the publisher bot surface. The value is shown only
 * once at issue/rotation time; the database stores its SHA-256 digest.
 */
export const BOT_PUBLISHER_TOKEN_PREFIX = "botpub_" as const;
export const BOT_PUBLISHER_TOKEN_DEFAULT_EXPIRY_DAYS = 90;
export const BOT_PUBLISHER_TOKEN_MAX_EXPIRY_DAYS = 365;

export const BOT_PUBLISHER_CAPABILITIES = [
  "create",
  "edit",
  "upload",
  "read",
  "publish",
  "schedule",
  "ready",
  "archive",
  "reschedule",
  "cancelSchedule",
  "featured",
  "unfeatured",
  "breaking",
  "regular",
  "hide",
  "show",
] as const;

export type BotPublisherCapability = (typeof BOT_PUBLISHER_CAPABILITIES)[number];

export const issueBotPublisherTokenSchema = z.object({
  email: z.string().trim().email(),
  label: z.string().trim().max(120).optional(),
  expiresInDays: z.number().int().min(1).max(BOT_PUBLISHER_TOKEN_MAX_EXPIRY_DAYS).optional(),
});

export const botPublisherLoginSchema = z.object({
  email: z.string().trim().email(),
  token: z.string().trim().min(BOT_PUBLISHER_TOKEN_PREFIX.length + 16),
});

export type IssueBotPublisherTokenInput = z.infer<typeof issueBotPublisherTokenSchema>;
export type BotPublisherLoginInput = z.infer<typeof botPublisherLoginSchema>;

export type BotPublisherPrincipal = {
  userId: string;
  tokenId: string;
  email: string;
  name: string;
  expiresAt: Date;
  capabilities: BotPublisherCapability[];
  /** Resolved agency/publisher account used for attribution and credits. */
  publisherId?: string;
  /** The owner of the publisher account (distinct from a linked staff user). */
  publisherOwnerUserId?: string;
};

export function normalizeBotPublisherEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function isBotPublisherToken(value: string): boolean {
  return value.startsWith(BOT_PUBLISHER_TOKEN_PREFIX) && value.length > BOT_PUBLISHER_TOKEN_PREFIX.length + 16;
}

