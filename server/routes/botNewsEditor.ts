import { Router, type Request, type RequestHandler } from "express";
import rateLimit from "express-rate-limit";
import { BotDraftError, type BotIdentity } from "../services/botDraftsService";

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

/** Mounted after legacy static paths and before /:id. Only shared routes fall through. */
export function botNewsEditor(language: Language, authenticate: RequestHandler, writeLimit: RequestHandler) {
  const router = Router();
  function authorize(shared: boolean): RequestHandler {
    return (req: EditorRequest, res, next) => {
      if (req.bot?.name === "nashr-sabq" && !req.bot.personal) return next();
      if (shared) return next("router");
      res.status(403).json({ code: "forbidden_action", message: "هذه العملية مخصصة لبوت نشر سبق" });
    };
  }
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
  const exclusive = [authenticate, authorize(false)];
  const shared = [authenticate, authorize(true)];
  const reads = () => import("../services/botEditorReads");
  const media = () => import("../services/botEditorMedia");
  const writes = () => import("../services/botEditorWrites");

  router.get("/", ...exclusive, endpoint(async req => (await reads()).listBotArticles(language, req.query), 200, "list_articles"));
  for (const kind of ["categories", "authors", "tags"]) {
    router.get("/" + kind, ...exclusive, endpoint(async req => (await reads()).readBotReference(language, kind, req.query), 200, "list_" + kind));
  }
  router.get("/media/search", ...exclusive, endpoint(async req => (await media()).searchBotMedia(language, req.query), 200, "search_media"));
  router.post("/images/generate", ...exclusive, writeLimit, generationLimit,
    endpoint(async req => (await media()).generateBotImage(language, req.body), 201));
  router.get("/:id/revisions", ...exclusive, endpoint(async req => {
    const { listBotEditorRevisions } = await import("../services/botEditorHistory");
    return listBotEditorRevisions(language, req.params.id, req.query);
  }, 200, "read_revisions"));
  router.get("/:id", ...shared, endpoint(async req => (await reads()).readBotArticle(language, req.params.id, req.query), 200, "read_article"));
  router.patch("/:id", ...shared, writeLimit, endpoint(async req => (await writes()).editBotArticle(language, req.params.id, req.body)));
  for (const action of ["archive", "restore", "unpublish"] as const) {
    router.post("/:id/" + action, ...(action === "unpublish" ? exclusive : shared), writeLimit,
      endpoint(async req => (await writes()).transitionBotArticle(language, req.params.id, action, req.body ?? {})));
  }
  router.patch("/:id/visibility", ...shared, writeLimit,
    endpoint(async req => (await writes()).changeBotVisibility(language, req.params.id, req.body)));
  router.post("/:id/related", ...exclusive, writeLimit,
    endpoint(async req => (await reads()).relatedBotArticles(language, req.params.id, req.body ?? {}), 200, "suggest_related"));
  router.post("/:id/cover/generate", ...exclusive, writeLimit, generationLimit,
    endpoint(async req => (await media()).generateBotCover(language, req.params.id, req.body ?? {})));
  router.post("/:id/regenerate-extras", ...shared, writeLimit, generationLimit,
    endpoint(async req => (await media()).regenerateEditorExtras(language, req.params.id, req.body ?? {})));
  router.get("/:id/push/:pushId", ...exclusive, endpoint(async req => {
    const { getBotPushReceipt } = await import("../services/botEditorPush");
    return getBotPushReceipt(language, req.params.id, req.params.pushId);
  }, 200, "read_push_receipt"));
  router.post("/:id/push", ...exclusive, writeLimit, pushLimit, endpoint(async req => {
    const { pushBotArticle } = await import("../services/botEditorPush");
    return pushBotArticle(language, req.params.id, req.body ?? {}, null);
  }, 202));
  const nashrOnly: RequestHandler = (req: EditorRequest, _res, next) => {
    if (req.bot?.name === "nashr-sabq" && !req.bot.personal) return next();
    return next("router");
  };
  const lifecycle = () => import("../services/botEditorLifecycle");
  router.post("/:id/ready", authenticate, nashrOnly, writeLimit,
    endpoint(async req => (await lifecycle()).runNashrAction(language, "ready", req.params.id, req.body ?? {})));
  router.delete("/:id", authenticate, nashrOnly, writeLimit,
    endpoint(async req => (await writes()).transitionBotArticle(language, req.params.id, "archive", req.body ?? {})));
  for (const action of ["resurface", "request-revision", "revert-to-draft", "translate"] as const) {
    router.post("/:id/" + (action === "translate" ? "translate-to-english" : action), ...exclusive, writeLimit,
      endpoint(async req => (await lifecycle()).runNashrAction(language, action, req.params.id, req.body ?? {})));
  }
  return router;
}
