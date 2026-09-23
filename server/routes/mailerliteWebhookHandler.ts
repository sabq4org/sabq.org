import type { Request, Response } from "express";
import { and, eq, notInArray } from "drizzle-orm";
import { newsletterSubscriptions } from "@shared/schema";
import { parseMailerLiteWebhooks } from "../services/mailerlite";
import {
  readMailerLiteSignature,
  verifyMailerLiteSignature,
} from "../services/mailerliteWebhookSignature";

const MAILERLITE_WEBHOOK_DB_BUDGET_MS = 1_800;
const TERMINAL_SUBSCRIPTION_STATUSES = ["unsubscribed", "bounced"] as const;

type UpdateQuery = {
  where(condition: unknown): Promise<unknown>;
};

type UpdateBuilder = {
  set(values: Record<string, unknown>): UpdateQuery;
};

export type MailerLiteWebhookDb = {
  update(table: typeof newsletterSubscriptions): UpdateBuilder;
};

export type MailerLiteWebhookDependencies = {
  db: MailerLiteWebhookDb;
  withStatementTimeout: <T>(timeoutMs: number, run: (tx: MailerLiteWebhookDb) => Promise<T>) => Promise<T>;
};

function safeErrorDetails(error: unknown): { name: string; code?: string } {
  const candidate = error as { name?: unknown; code?: unknown };
  const details: { name: string; code?: string } = {
    name: typeof candidate?.name === "string" ? candidate.name.slice(0, 80) : "Error",
  };
  if (typeof candidate?.code === "string") details.code = candidate.code.slice(0, 40);
  return details;
}

export function createMailerLiteWebhookHandler({
  db,
  withStatementTimeout,
}: MailerLiteWebhookDependencies) {
  return async (req: Request & { rawBody?: Buffer }, res: Response) => {
    try {
      if (!req.rawBody) {
        return res.status(400).json({ error: "Unable to verify request signature" });
      }

      if (!verifyMailerLiteSignature(
        req.rawBody,
        readMailerLiteSignature(req.headers),
      )) {
        return res.status(401).json({ error: "Unauthorized: invalid webhook signature" });
      }

      const events = parseMailerLiteWebhooks(req.body);
      if (events.length !== 1 ||
          !["subscriber.unsubscribed", "subscriber.bounced"].includes(events[0]?.type || "") ||
          !events[0]?.data.subscriber?.email) {
        return res.status(422).json({ error: "Unsupported or invalid webhook event" });
      }

      const [{ type, data }] = events;
      const email = data.subscriber!.email;
      await withStatementTimeout(MAILERLITE_WEBHOOK_DB_BUDGET_MS, async (tx) => {
        const changedAt = new Date();
        const values = type === "subscriber.unsubscribed"
          ? { status: "unsubscribed", unsubscribedAt: changedAt, updatedAt: changedAt }
          : { status: "bounced", updatedAt: changedAt };
        await tx
          .update(newsletterSubscriptions)
          .set(values)
          .where(and(
            eq(newsletterSubscriptions.email, email),
            notInArray(newsletterSubscriptions.status, [...TERMINAL_SUBSCRIPTION_STATUSES]),
          ));
      });

      return res.json({ success: true, received: type });
    } catch (error) {
      // Never log the payload, email, query parameters, or database error text.
      console.error("[MailerLite Webhook] processing failed", safeErrorDetails(error));
      return res.status(500).json({ error: "Webhook processing failed" });
    }
  };
}
