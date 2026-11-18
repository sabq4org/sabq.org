import type { NextFunction, Request, RequestHandler, Response } from "express";
import {
  isEditorCapabilityEnabled,
  isOpinionArticleType,
  isProtectedArticleId,
  type NashrEditorCapability,
} from "@shared/botEditorCapabilities";
import { BotDraftError, type BotIdentity } from "./botDraftsService";

type GuardedRequest = Request & { bot?: BotIdentity };

/** هوية نشر سبق غير الشخصية: التوكن المسمّى nashr-sabq في BOT_DRAFTS_API_TOKENS. */
export function isNashrPrincipal(bot: BotIdentity | null | undefined): boolean {
  return bot?.name === "nashr-sabq" && !bot.personal;
}

const DISABLED_MESSAGE = "هذه القدرة معطّلة مؤقتاً من إعدادات الخادم";

/** يرمي 403 إن عُطّلت القدرة بمفتاح الإيقاف السريع. للخدمات التي تُستدعى بعد المصادقة. */
export function assertEditorCapability(capability: NashrEditorCapability): void {
  if (!isEditorCapabilityEnabled(capability)) {
    throw new BotDraftError(403, "capability_disabled", DISABLED_MESSAGE, { capability });
  }
}

/**
 * يحرس مساراً بقدرة. غير nashr: المسار المخصّص يعطي 403، والمسار المشترك
 * (shared) يمرّر للمعالج القديم عبر next("router") كما كان.
 */
export function requireEditorCap(capability: NashrEditorCapability, options: { shared?: boolean } = {}): RequestHandler {
  return (req: GuardedRequest, res: Response, next: NextFunction) => {
    if (!isNashrPrincipal(req.bot)) {
      if (options.shared) return next("router");
      return res.status(403).json({ code: "forbidden_action", message: "هذه العملية مخصصة لبوت نشر سبق" });
    }
    if (!isEditorCapabilityEnabled(capability)) {
      return res.status(403).json({ code: "capability_disabled", message: DISABLED_MESSAGE, details: { capability } });
    }
    return next();
  };
}

export const PROTECTED_ARTICLE_MESSAGE = "هذه المادة محمية من تعديل البوتات. الكتابة عليها من اللوحة فقط";

/** طبقة الخدمة: عمق دفاعي إضافي خلف حارس المسار. */
export function assertNotProtected(articleId: string): void {
  if (isProtectedArticleId(articleId)) {
    throw new BotDraftError(423, "protected_article", PROTECTED_ARTICLE_MESSAGE, { articleId });
  }
}

/**
 * يُستدعى من requireBotToken بعد ضبط req.bot: أي كتابة (غير GET/HEAD) على مادة
 * محمية ترجع 423 لكل هويات البوت (nashr وgrok-bot والشخصية). القراءة مسموحة.
 * محاولة الحجب تُسجَّل. (لا يصلح router.param: يعمل قبل المصادقة.)
 */
export async function blockProtectedWrite(req: GuardedRequest, res: Response, next: NextFunction) {
  const id = req.params?.id;
  if (!id || req.method === "GET" || req.method === "HEAD" || req.method === "OPTIONS") return next();
  if (!isProtectedArticleId(id)) return next();
  try {
    const { recordBotEditorOperation } = await import("./botEditorOperationsAudit");
    await recordBotEditorOperation({
      actorId: null,
      operation: "protected_write_blocked",
      outcome: "failed",
      metadata: { articleId: id, method: req.method, principal: req.bot?.name ?? "unknown" },
    });
  } catch {
    // السجل لا يعطّل الرفض.
  }
  return res.status(423).json({ code: "protected_article", message: PROTECTED_ARTICLE_MESSAGE });
}

const NEWS_TYPES = new Set(["news", "infographic"]);
const OPINION_STATE_OPERATIONS = new Set(["archive", "restore", "unpublish"]);

/**
 * نوع المادة المسموح لمحرر نشر سبق. الأخبار والإنفوجرافيك كما كانت. المقالات الرأيية (العربية فقط) تتطلب
 * القدرة opinion.lifecycle: analysis وcolumn بدورة الخبر كاملة، وopinion بالأرشفة والاستعادة وسحب النشر فقط
 * لأن تحريرها وجدولتها ونشرها تمر بمكتب الرأي (/opinion/drafts).
 */
export function assertNashrArticleType(language: "ar" | "en", articleType: unknown, operation: string): void {
  if (typeof articleType === "string" && NEWS_TYPES.has(articleType)) return;
  if (language === "ar" && isOpinionArticleType(articleType)) {
    assertEditorCapability("opinion.lifecycle");
    if (articleType === "opinion" && !OPINION_STATE_OPERATIONS.has(operation)) {
      throw new BotDraftError(403, "forbidden_action", "مقالات الرأي تُحرَّر وتُجدوَل وتُنشر عبر مسارات مكتب الرأي /opinion/drafts", { articleType, operation });
    }
    return;
  }
  throw new BotDraftError(403, "forbidden_action", "نوع المادة غير مدعوم");
}
