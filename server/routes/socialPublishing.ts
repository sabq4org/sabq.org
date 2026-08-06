// النشر الاجتماعي (X) — API لوحة التحكم (Passport session + RBAC + CSRF عام).
// عقود النظام: docs/systems/social-publishing/SYSTEM.md
// ADR-001: لا استعلامات Drizzle هنا — كلها في server/services/socialPublishing/*
import { Router, type Request, type Response } from "express";
import rateLimit from "express-rate-limit";
import { z } from "zod";
import { PERMISSION_CODES } from "@shared/rbac-constants";
import { requireAuth, requirePermission } from "../rbac";
import {
  cancelPost,
  claimPostForImmediatePublish,
  createDraftPost,
  disconnectAccount,
  getArticleShareContext,
  getConnectedAccount,
  getPost,
  getPostAttempts,
  listAccounts,
  listPostsForArticle,
  listRecentPosts,
  publishClaimedPost,
  saveConnectedAccount,
  schedulePost,
  SocialPublishValidationError,
  updateEditablePost,
} from "../services/socialPublishing/socialPublishingService";
import { suggestSocialPostForArticle } from "../services/socialPublishing/suggestService";
import {
  buildAuthorizeRequest,
  exchangeAuthorizationCode,
  fetchIdentityWithToken,
  revokeAccessToken,
  xOAuthConfigured,
  X_OAUTH_SCOPES,
} from "../services/socialPublishing/xApiClient";
import { decryptCredentials, encryptCredentials } from "../services/socialPublishing/tokenCrypto";
import { SocialProviderError } from "../services/socialPublishing/types";

const router = Router();
const requestUserId = (req: Request) => (req.user as { id: string }).id;

const suggestLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 30,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: requestUserId,
  message: { message: "وصلت حد توليد الاقتراحات مؤقتاً؛ حاول بعد دقائق" },
});

const publishLimiter = rateLimit({
  windowMs: 5 * 60 * 1000,
  limit: 20,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: requestUserId,
  message: { message: "محاولات نشر كثيرة خلال فترة قصيرة؛ انتظر قليلاً" },
});

function handleError(res: Response, error: unknown, fallback: string): void {
  if (error instanceof SocialPublishValidationError) {
    res.status(error.status).json({ message: error.message });
    return;
  }
  if (error instanceof SocialProviderError) {
    // رسائل المزود منظفة مسبقاً من الأسرار
    res.status(502).json({ message: error.message, retryable: error.opts.retryable });
    return;
  }
  console.error("[SocialPublish routes]", error);
  res.status(500).json({ message: fallback });
}

// ── الحسابات وربط X ────────────────────────────────────────────────

router.get(
  "/api/social-publishing/accounts",
  requireAuth,
  requirePermission(PERMISSION_CODES.SOCIAL_PUBLISH_VIEW),
  async (_req, res) => {
    try {
      res.json({
        accounts: await listAccounts(),
        oauthConfigured: xOAuthConfigured(),
        requiredScopes: X_OAUTH_SCOPES,
      });
    } catch (error) {
      handleError(res, error, "تعذر جلب الحسابات");
    }
  },
);

router.get(
  "/api/social-publishing/x/oauth/start",
  requireAuth,
  requirePermission(PERMISSION_CODES.SOCIAL_PUBLISH_MANAGE_ACCOUNTS),
  async (req, res) => {
    try {
      const redirectUri = xOAuthRedirectUri();
      const { authorizeUrl, state, codeVerifier } = buildAuthorizeRequest(redirectUri);
      (req.session as any).xOauth = { state, codeVerifier, redirectUri, at: Date.now() };
      res.json({ authorizeUrl });
    } catch (error) {
      handleError(res, error, "تعذر بدء ربط حساب X");
    }
  },
);

function xOAuthRedirectUri(): string {
  const base = process.env.PUBLIC_SITE_URL || process.env.FRONTEND_URL || "https://sabq.org";
  return (
    process.env.X_OAUTH_REDIRECT_URI ||
    `${base.replace(/\/$/, "")}/api/social-publishing/x/oauth/callback`
  );
}

router.get(
  "/api/social-publishing/x/oauth/callback",
  requireAuth,
  requirePermission(PERMISSION_CODES.SOCIAL_PUBLISH_MANAGE_ACCOUNTS),
  async (req, res) => {
    const dashboardUrl = "/dashboard/social-publishing";
    try {
      const { code, state, error: oauthError } = req.query as Record<string, string | undefined>;
      const saved = (req.session as any).xOauth as
        | { state: string; codeVerifier: string; redirectUri: string; at: number }
        | undefined;
      delete (req.session as any).xOauth;
      if (oauthError) {
        return res.redirect(`${dashboardUrl}?x=denied`);
      }
      if (!code || !state || !saved || saved.state !== state) {
        return res.redirect(`${dashboardUrl}?x=state_mismatch`);
      }
      if (Date.now() - saved.at > 10 * 60 * 1000) {
        return res.redirect(`${dashboardUrl}?x=expired`);
      }
      const { credentials, expiresAt } = await exchangeAuthorizationCode({
        code,
        codeVerifier: saved.codeVerifier,
        redirectUri: saved.redirectUri,
      });
      const identity = await fetchIdentityWithToken(credentials.accessToken);
      await saveConnectedAccount({
        platform: "x",
        handle: identity.handle,
        externalAccountId: identity.externalAccountId,
        displayName: identity.displayName,
        credentialsEncrypted: encryptCredentials(credentials),
        tokenExpiresAt: expiresAt,
        scopes: credentials.scope ?? X_OAUTH_SCOPES,
        connectedByUserId: requestUserId(req),
      });
      res.redirect(`${dashboardUrl}?x=connected`);
    } catch (error) {
      console.error("[SocialPublish oauth callback]", error);
      res.redirect(`${dashboardUrl}?x=error`);
    }
  },
);

router.delete(
  "/api/social-publishing/accounts/:id",
  requireAuth,
  requirePermission(PERMISSION_CODES.SOCIAL_PUBLISH_MANAGE_ACCOUNTS),
  async (req, res) => {
    try {
      // إبطال التوكن لدى X أفضل جهد قبل الفصل محلياً
      const account = await getConnectedAccount("x");
      if (account && account.id === req.params.id && account.credentialsEncrypted) {
        const creds = decryptCredentials(account.credentialsEncrypted);
        if (creds?.accessToken) await revokeAccessToken(creds.accessToken);
      }
      const ok = await disconnectAccount(req.params.id);
      if (!ok) return res.status(404).json({ message: "الحساب غير موجود" });
      res.json({ success: true });
    } catch (error) {
      handleError(res, error, "تعذر فك ربط الحساب");
    }
  },
);

// ── سياق الخبر والاقتراح ───────────────────────────────────────────

router.get(
  "/api/social-publishing/context/:articleId",
  requireAuth,
  requirePermission(PERMISSION_CODES.SOCIAL_PUBLISH_VIEW),
  async (req, res) => {
    try {
      const context = await getArticleShareContext(req.params.articleId);
      if (!context) return res.status(404).json({ message: "الخبر غير موجود" });
      res.json(context);
    } catch (error) {
      handleError(res, error, "تعذر جلب بيانات الخبر");
    }
  },
);

const suggestSchema = z.object({ articleId: z.string().min(1) });

router.post(
  "/api/social-publishing/suggest",
  requireAuth,
  requirePermission(PERMISSION_CODES.SOCIAL_PUBLISH_AI_GENERATE),
  suggestLimiter,
  async (req, res) => {
    try {
      const { articleId } = suggestSchema.parse(req.body);
      const suggestion = await suggestSocialPostForArticle({
        articleId,
        userId: requestUserId(req),
      });
      res.json(suggestion);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: error.errors[0]?.message ?? "طلب غير صالح" });
      }
      handleError(res, error, "تعذر توليد الاقتراح — يمكنك كتابة النص يدوياً");
    }
  },
);

// ── المنشورات ──────────────────────────────────────────────────────

const createPostSchema = z.object({
  articleId: z.string().min(1),
  text: z.string().min(1).max(2000),
  textSource: z.enum(["title", "title_link", "custom", "ai"]),
  includeLink: z.boolean(),
  imageSource: z.enum(["article", "upload", "library", "none"]),
  imageUrl: z.string().max(2000).nullish(),
});

router.post(
  "/api/social-publishing/posts",
  requireAuth,
  requirePermission(PERMISSION_CODES.SOCIAL_PUBLISH_CREATE),
  async (req, res) => {
    try {
      const body = createPostSchema.parse(req.body);
      const post = await createDraftPost({
        ...body,
        imageUrl: body.imageUrl ?? null,
        createdByUserId: requestUserId(req),
      });
      res.status(201).json(post);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: error.errors[0]?.message ?? "طلب غير صالح" });
      }
      handleError(res, error, "تعذر إنشاء المسودة");
    }
  },
);

router.get(
  "/api/social-publishing/posts",
  requireAuth,
  requirePermission(PERMISSION_CODES.SOCIAL_PUBLISH_VIEW_LOG),
  async (req, res) => {
    try {
      const articleId = typeof req.query.articleId === "string" ? req.query.articleId : null;
      if (articleId) {
        res.json({ posts: await listPostsForArticle(articleId) });
      } else {
        res.json({ posts: await listRecentPosts(50) });
      }
    } catch (error) {
      handleError(res, error, "تعذر جلب سجل المنشورات");
    }
  },
);

router.get(
  "/api/social-publishing/posts/:id",
  requireAuth,
  requirePermission(PERMISSION_CODES.SOCIAL_PUBLISH_VIEW_LOG),
  async (req, res) => {
    try {
      const post = await getPost(req.params.id);
      if (!post) return res.status(404).json({ message: "المنشور غير موجود" });
      res.json({ post, attempts: await getPostAttempts(post.id) });
    } catch (error) {
      handleError(res, error, "تعذر جلب المنشور");
    }
  },
);

const updatePostSchema = z.object({
  text: z.string().min(1).max(2000).optional(),
  includeLink: z.boolean().optional(),
  imageSource: z.enum(["article", "upload", "library", "none"]).optional(),
  imageUrl: z.string().max(2000).nullable().optional(),
});

router.patch(
  "/api/social-publishing/posts/:id",
  requireAuth,
  requirePermission(PERMISSION_CODES.SOCIAL_PUBLISH_MANAGE_SCHEDULED),
  async (req, res) => {
    try {
      const body = updatePostSchema.parse(req.body);
      const post = await updateEditablePost(req.params.id, body);
      res.json(post);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: error.errors[0]?.message ?? "طلب غير صالح" });
      }
      handleError(res, error, "تعذر تعديل المنشور");
    }
  },
);

router.post(
  "/api/social-publishing/posts/:id/publish",
  requireAuth,
  requirePermission(PERMISSION_CODES.SOCIAL_PUBLISH_NOW),
  publishLimiter,
  async (req, res) => {
    try {
      // مطالبة شرطية — النقر المزدوج/التكرار الشبكي يجد processing فيرد 409
      const claimed = await claimPostForImmediatePublish(req.params.id);
      if (!claimed) {
        const current = await getPost(req.params.id);
        if (!current) return res.status(404).json({ message: "المنشور غير موجود" });
        return res.status(409).json({
          message:
            current.status === "published"
              ? "هذا المنشور نُشر سابقاً"
              : "المنشور قيد النشر بالفعل أو حالته لا تسمح",
          post: current,
        });
      }
      const result = await publishClaimedPost(claimed, requestUserId(req));
      if (result.status === "published") {
        res.json({ post: result });
      } else {
        res.status(502).json({ message: result.lastError || "فشل النشر", post: result });
      }
    } catch (error) {
      handleError(res, error, "تعذر تنفيذ النشر");
    }
  },
);

const scheduleSchema = z.object({ scheduledAt: z.string().datetime({ offset: true }) });

router.post(
  "/api/social-publishing/posts/:id/schedule",
  requireAuth,
  requirePermission(PERMISSION_CODES.SOCIAL_PUBLISH_SCHEDULE),
  async (req, res) => {
    try {
      const { scheduledAt } = scheduleSchema.parse(req.body);
      const post = await schedulePost(req.params.id, new Date(scheduledAt));
      res.json(post);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "صيغة وقت الجدولة غير صالحة (ISO مع المنطقة الزمنية)" });
      }
      handleError(res, error, "تعذرت الجدولة");
    }
  },
);

router.post(
  "/api/social-publishing/posts/:id/cancel",
  requireAuth,
  requirePermission(PERMISSION_CODES.SOCIAL_PUBLISH_MANAGE_SCHEDULED),
  async (req, res) => {
    try {
      const post = await cancelPost(req.params.id, requestUserId(req));
      res.json(post);
    } catch (error) {
      handleError(res, error, "تعذر الإلغاء");
    }
  },
);

export default router;
