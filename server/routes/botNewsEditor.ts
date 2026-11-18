import { Router, type Request, type RequestHandler } from "express";
import rateLimit from "express-rate-limit";
import { BotDraftError, type BotIdentity } from "../services/botDraftsService";
import { requireEditorCap } from "../services/botEditorCapabilityGuard";
import type { NashrEditorCapability } from "@shared/botEditorCapabilities";

type Language = "ar" | "en";
type EditorRequest = Request & { bot?: BotIdentity };

function operationLimiter(setting: string, fallback: number) {
  return rateLimit({
    windowMs: 60_000,
    limit: () => Number(process.env[setting]) || fallback,
    // The same authenticated principal shares its allowance across editions.
    keyGenerator: () => "nashr-sabq",
    standardHeaders: true,
    legacyHeaders: false,
    handler: (_req, res) => res.status(429).json({ code: "rate_limited", message: "تجاوزت حد الطلبات؛ أعد المحاولة بعد قليل" }),
  });
}

const generationLimit = operationLimiter("BOT_DRAFTS_EXTRAS_RATE_LIMIT", 10);
const pushLimit = operationLimiter("BOT_DRAFTS_PUSH_RATE_LIMIT", 2);

/**
 * Mounted after legacy static paths and before /:id. Only shared routes fall through.
 * كل مسار محروس بقدرة مسمّاة (shared/botEditorCapabilities.ts) بدل فحص اسم البوت،
 * ومفتاح BOT_EDITOR_DISABLED_CAPS يعطّل أي قدرة بلا إعادة نشر.
 */
export function botNewsEditor(language: Language, authenticate: RequestHandler, writeLimit: RequestHandler) {
  const router = Router();
  type Action = (req: Request) => Promise<unknown>;
  function endpoint(action: Action, status = 200, readOperation?: string): RequestHandler {
    return async (req, res) => {
      try {
        const result = await action(req);
        if (readOperation) {
          const { recordBotEditorOperation } = await import("../services/botEditorOperationsAudit");
          await recordBotEditorOperation({ actorId: null, operation: readOperation, outcome: "succeeded",
            metadata: { language, articleId: req.params.id ?? null, originalSource: result && typeof result === "object" && "source" in result && typeof result.source === "string" ? result.source : null } });
        }
        if (result && typeof result === "object" && "__httpStatus" in result) {
          const wrapped = result as unknown as { __httpStatus: number; body: unknown };
          res.status(Number(wrapped.__httpStatus)).json(wrapped.body);
          return;
        }
        res.status(status).json(result);
      } catch (error) {
        if (error instanceof BotDraftError) {
          res.status(error.httpStatus).json({ code: error.code, message: error.message, details: error.details });
          return;
        }
        const { BotEditorPushError } = await import("../services/botEditorPush");
        if (error instanceof BotEditorPushError) {
          res.status(error.status).json({ code: error.code, message: error.message, ...("details" in error ? { details: error.details } : {}) });
          return;
        }
        console.error("[BotNewsEditor] request failed", { language, route: req.route.path, type: error instanceof Error ? error.name : "unknown" });
        res.status(500).json({ code: "server_error", message: "تعذّر إتمام العملية" });
      }
    };
  }
  const exclusive = (cap: NashrEditorCapability) => [authenticate, requireEditorCap(cap)];
  const shared = (cap: NashrEditorCapability) => [authenticate, requireEditorCap(cap, { shared: true })];
  const reads = () => import("../services/botEditorReads");
  const media = () => import("../services/botEditorMedia");
  const writes = () => import("../services/botEditorWrites");
  const ai = () => import("../services/botEditorAi");
  const gpt = () => import("../services/botEditorGptImages");

  router.get("/", ...exclusive("article.read"), endpoint(async req => (await reads()).listBotArticles(language, req.query), 200, "list_articles"));
  for (const kind of ["categories", "authors", "tags"]) {
    router.get("/" + kind, ...exclusive("article.read"), endpoint(async req => (await reads()).readBotReference(language, kind, req.query), 200, "list_" + kind));
  }
  router.get("/media/search", ...exclusive("media.search"), endpoint(async req => (await media()).searchBotMedia(language, req.query), 200, "search_media"));
  router.delete("/media/:mediaId", ...exclusive("media.delete"), writeLimit,
    endpoint(async req => (await media()).deleteBotMedia(req.params.mediaId, req.body ?? {})));
  router.post("/images/generate", ...exclusive("image.generate"), writeLimit, generationLimit,
    endpoint(async req => (await media()).generateBotImage(language, req.body), 201));
  router.post("/images/edit", ...exclusive("image.edit"), writeLimit, generationLimit,
    endpoint(async req => (await media()).editBotImage(language, req.body), 201));
  router.post("/images/generate-gpt", ...exclusive("image.generate_gpt"), writeLimit, generationLimit,
    endpoint(async req => (await gpt()).startBotGptImage(language, req.body), 202));
  router.get("/images/generate-gpt/:jobId", ...exclusive("image.generate_gpt"),
    endpoint(async req => (await gpt()).getBotGptImage(req.params.jobId)));
  router.post("/ai/titles", ...exclusive("ai.titles"), writeLimit, generationLimit,
    endpoint(async req => (await ai()).suggestBotTitles(language, req.body)));
  router.post("/ai/proofread", ...exclusive("ai.proofread"), writeLimit, generationLimit,
    endpoint(async req => (await ai()).proofreadBot(language, req.body)));
  router.post("/ai/compare-headlines", ...exclusive("ai.compare_headlines"), writeLimit, generationLimit,
    endpoint(async req => (await ai()).compareBotHeadlines(language, req.body)));
  if (language === "ar") {
    // مقالات الرأي (نوع opinion) عبر مكتب الرأي نفسه. analysis وcolumn بدورة الأخبار العادية.
    const opinion = () => import("../services/botEditorOpinion");
    const base = "/opinion/drafts";
    router.get(base, ...exclusive("opinion.read"), endpoint(async req => (await opinion()).opinionBoard(req.query), 200, "opinion_board"));
    router.get(base + "/:id", ...exclusive("opinion.read"), endpoint(async req => (await opinion()).opinionDetail(req.params.id), 200, "opinion_read"));
    router.patch(base + "/:id", ...exclusive("opinion.edit"), writeLimit, endpoint(async req => (await opinion()).editOpinion(req.params.id, req.body)));
    router.get(base + "/:id/slot-check", ...exclusive("opinion.read"), endpoint(async req => (await opinion()).opinionSlotCheck(req.params.id, req.query)));
    router.post(base + "/:id/prepare", ...exclusive("opinion.lifecycle"), writeLimit, generationLimit,
      endpoint(async req => { const out = await (await opinion()).prepareOpinion(req.params.id, req.body); return { __httpStatus: 202, body: out }; }));
    router.get(base + "/:id/prepare", ...exclusive("opinion.read"), endpoint(async req => (await opinion()).opinionPrepareStatus(req.params.id)));
    router.post(base + "/:id/image", ...exclusive("opinion.image"), writeLimit, generationLimit,
      endpoint(async req => (await opinion()).imageOpinion(req.params.id, req.body)));
    router.get(base + "/:id/image", ...exclusive("opinion.read"), endpoint(async req => (await opinion()).opinionImageStatus(req.params.id)));
    router.post(base + "/:id/schedule", ...exclusive("opinion.lifecycle"), writeLimit, endpoint(async req => (await opinion()).scheduleOpinion(req.params.id, req.body)));
    router.post(base + "/:id/publish", ...exclusive("opinion.lifecycle"), writeLimit, endpoint(async req => (await opinion()).publishOpinion(req.params.id, req.body)));
    router.post(base + "/:id/return", ...exclusive("opinion.lifecycle"), writeLimit, endpoint(async req => (await opinion()).returnOpinion(req.params.id, req.body)));
  }
  router.get("/:id/revisions", ...exclusive("article.read"), endpoint(async req => {
    const { listBotEditorRevisions } = await import("../services/botEditorHistory");
    return listBotEditorRevisions(language, req.params.id, req.query);
  }, 200, "read_revisions"));
  router.get("/:id", ...shared("article.read"), endpoint(async req => (await reads()).readBotArticle(language, req.params.id, req.query), 200, "read_article"));
  router.patch("/:id", ...shared("article.edit"), writeLimit, endpoint(async req => (await writes()).editBotArticle(language, req.params.id, req.body)));
  for (const action of ["archive", "restore", "unpublish"] as const) {
    router.post("/:id/" + action, ...(action === "unpublish" ? exclusive("article.unpublish") : shared("article.archive")), writeLimit,
      endpoint(async req => (await writes()).transitionBotArticle(language, req.params.id, action, req.body ?? {})));
  }
  router.patch("/:id/visibility", ...shared("article.visibility"), writeLimit,
    endpoint(async req => (await writes()).changeBotVisibility(language, req.params.id, req.body)));
  router.post("/:id/related", ...exclusive("article.read"), writeLimit,
    endpoint(async req => (await reads()).relatedBotArticles(language, req.params.id, req.body ?? {}), 200, "suggest_related"));
  router.post("/:id/cover/generate", ...exclusive("image.cover"), writeLimit, generationLimit,
    endpoint(async req => (await media()).generateBotCover(language, req.params.id, req.body ?? {})));
  router.post("/:id/regenerate-extras", ...shared("ai.extras"), writeLimit, generationLimit,
    endpoint(async req => (await media()).regenerateEditorExtras(language, req.params.id, req.body ?? {})));
  router.get("/:id/push/:pushId", ...exclusive("article.push"), endpoint(async req => {
    const { getBotPushReceipt } = await import("../services/botEditorPush");
    return getBotPushReceipt(language, req.params.id, req.params.pushId);
  }, 200, "read_push_receipt"));
  router.post("/:id/push", ...exclusive("article.push"), writeLimit, pushLimit, endpoint(async req => {
    const { pushBotArticle } = await import("../services/botEditorPush");
    return pushBotArticle(language, req.params.id, req.body ?? {}, null);
  }, 202));
  const lifecycle = () => import("../services/botEditorLifecycle");
  router.post("/:id/ready", ...shared("article.ready"), writeLimit,
    endpoint(async req => (await lifecycle()).runNashrAction(language, "ready", req.params.id, req.body ?? {})));
  // DELETE = أرشفة ناعمة بسبب إلزامي وexpectedUpdatedAt إلزامي (جسم JSON أو query).
  router.delete("/:id", ...shared("article.delete"), writeLimit,
    endpoint(async req => (await writes()).deleteBotArticle(language, req.params.id, { ...(req.query ?? {}), ...(req.body ?? {}) })));
  for (const action of ["resurface", "request-revision", "revert-to-draft", "translate"] as const) {
    router.post("/:id/" + (action === "translate" ? "translate-to-english" : action),
      ...exclusive(action === "translate" ? "article.translate" : "article.revision"), writeLimit,
      endpoint(async req => (await lifecycle()).runNashrAction(language, action, req.params.id, req.body ?? {})));
  }
  return router;
}
