import { Router, type Request, type Response } from "express";
import { z } from "zod";
import { logActivity, requireAuth, requirePermission } from "../rbac";
import {
  BotPublisherTokenError,
  issueBotPublisherToken,
  listBotPublisherTokens,
  revokeBotPublisherToken,
  rotateBotPublisherToken,
} from "../services/botPublisherTokenService";
import { issueBotPublisherTokenSchema } from "@shared/botPublisherTokens";

const router = Router();
const base = "/api/admin/bot-publisher-tokens";
const rotateSchema = issueBotPublisherTokenSchema.omit({ email: true });

function requestUserId(req: Request): string {
  return (req.user as { id: string }).id;
}

function sendServiceError(res: Response, error: unknown): void {
  if (error instanceof BotPublisherTokenError) {
    res.status(error.status).json({ code: error.code, message: error.message });
    return;
  }
  // Do not print database errors: their parameter arrays can disclose token
  // material or other credential-adjacent values even when the raw token is
  // never intentionally logged.
  console.error("[BotPublisherTokens] request failed");
  res.status(500).json({ message: "تعذر تنفيذ عملية توكن الناشر" });
}

async function bestEffortAudit(entry: Parameters<typeof logActivity>[0]): Promise<void> {
  try {
    await logActivity(entry);
  } catch {
    // Issuance/rotation returns the one-time secret independently of audit
    // storage. Never turn a successful credential operation into a response
    // that loses the only plaintext copy because audit storage is unavailable.
    console.error("[BotPublisherTokens] audit write failed");
  }
}

router.use(base, (req, res, next) => {
  res.setHeader("Cache-Control", "private, no-store");
  next();
}, requireAuth, requirePermission("system.manage_settings"));

router.get(base, async (_req, res) => {
  try {
    res.setHeader("Cache-Control", "private, no-store");
    res.json(await listBotPublisherTokens());
  } catch (error) {
    sendServiceError(res, error);
  }
});

router.post(base, async (req, res) => {
  try {
    const input = issueBotPublisherTokenSchema.parse(req.body);
    const issued = await issueBotPublisherToken({ ...input, issuedByUserId: requestUserId(req) });
    await bestEffortAudit({
      userId: requestUserId(req),
      action: "bot_publisher_token_issued",
      entityType: "bot_publisher_token",
      entityId: issued.tokenId,
      newValue: {
        userId: issued.user.id,
        email: issued.email,
        label: issued.label,
        tokenPrefix: issued.tokenPrefix,
        expiresAt: issued.expiresAt.toISOString(),
      },
    });
    // The raw token is intentionally returned only from this issue/rotate call.
    res.status(201).json(issued);
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ code: "INVALID_INPUT", message: "بيانات التوكن غير صالحة", issues: error.issues });
      return;
    }
    sendServiceError(res, error);
  }
});

router.post(`${base}/:id/revoke`, async (req, res) => {
  try {
    const revoked = await revokeBotPublisherToken(req.params.id);
    if (!revoked) {
      res.status(404).json({ code: "TOKEN_NOT_FOUND", message: "التوكن غير موجود أو مبطل" });
      return;
    }
    await bestEffortAudit({
      userId: requestUserId(req),
      action: "bot_publisher_token_revoked",
      entityType: "bot_publisher_token",
      entityId: req.params.id,
      newValue: { revokedAt: new Date().toISOString() },
    });
    res.json({ id: req.params.id, revoked: true });
  } catch (error) {
    sendServiceError(res, error);
  }
});

router.post(`${base}/:id/rotate`, async (req, res) => {
  try {
    const input = rotateSchema.parse(req.body ?? {});
    const issued = await rotateBotPublisherToken(req.params.id, {
      ...input,
      issuedByUserId: requestUserId(req),
    });
    await bestEffortAudit({
      userId: requestUserId(req),
      action: "bot_publisher_token_rotated",
      entityType: "bot_publisher_token",
      entityId: issued.tokenId,
      newValue: {
        userId: issued.user.id,
        email: issued.email,
        label: issued.label,
        tokenPrefix: issued.tokenPrefix,
        expiresAt: issued.expiresAt.toISOString(),
      },
      metadata: { replacedTokenId: req.params.id },
    });
    res.status(201).json(issued);
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ code: "INVALID_INPUT", message: "بيانات التدوير غير صالحة", issues: error.issues });
      return;
    }
    sendServiceError(res, error);
  }
});

export default router;
export { router as botPublisherTokensRouter };
