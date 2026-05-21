/**
 * Mobile-submitted article auto-enrichment pipeline.
 *
 * Triggered fire-and-forget right after POST /api/v1/articles/submit
 * inserts a draft article. We:
 *   - PRESERVE the title verbatim (user contract)
 *   - Generate: ai summary + 3-bullet TL;DR, SEO keywords, meta
 *     description, social title/description, image alt text, newsletter
 *     subtitle + excerpt, AND a category suggestion picked from the real
 *     `categories` table (confidence-scored, never auto-assigned —
 *     reviewer decides per the user's explicit preference).
 *   - Run the existing ifoxQualityService proofreader so the dashboard
 *     reviewer sees a quality score + issue list when they open the
 *     draft.
 *
 * Everything goes through ONE round-trip to the LLM via aiManager to keep
 * latency + cost down (a separate, smaller call runs the quality check
 * because that service already encapsulates its own prompt + scoring).
 *
 * Idempotent: re-running on a finished article is a no-op (we look at
 * seoMetadata.status + aiSummary to detect prior runs).
 */

import { db } from "../db";
import { articles, categories } from "@shared/schema";
import { eq } from "drizzle-orm";
import { aiManager } from "../ai-manager";
import { ifoxQualityService } from "./ifox/qualityService";

interface EnrichmentJsonShape {
  summary?: string;
  bullets?: string[];
  keywords?: string[];
  metaDescription?: string;
  socialTitle?: string;
  socialDescription?: string;
  imageAltText?: string;
  newsletterSubtitle?: string;
  newsletterExcerpt?: string;
  bestCategorySlug?: string;
  categoryConfidence?: number;
  categoryReason?: string;
}

/**
 * Strip HTML tags so we hand the LLM clean prose. Mobile-submitted
 * articles arrive as HTML (paragraph wraps, etc.) but the AI works best
 * with the raw text.
 */
function htmlToPlainText(html: string): string {
  return html
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, " ")
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, " ")
    .replace(/<\/(p|div|h[1-6]|li|br|hr)>/gi, "\n")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Pull the JSON object out of an LLM response, even if it's wrapped in
 * markdown fences or has prose around it.
 */
function extractJson(raw: string): any | null {
  const stripped = raw.trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/```\s*$/i, "")
    .trim();
  try {
    return JSON.parse(stripped);
  } catch {
    // Try to find the first top-level {...} block.
    const firstBrace = stripped.indexOf("{");
    const lastBrace = stripped.lastIndexOf("}");
    if (firstBrace >= 0 && lastBrace > firstBrace) {
      try {
        return JSON.parse(stripped.slice(firstBrace, lastBrace + 1));
      } catch {
        return null;
      }
    }
    return null;
  }
}

interface SimpleCategory {
  id: string;
  slug: string;
  name: string;
}

async function loadActiveCategories(): Promise<SimpleCategory[]> {
  // Only consider categories that are currently visible to readers — hidden
  // / deprecated buckets (e.g. the AI-content sections) must never be
  // surfaced as suggestions to a human-submitted article.
  const rows = await db
    .select({
      id: categories.id,
      slug: categories.slug,
      nameAr: categories.nameAr,
      nameEn: categories.nameEn,
    })
    .from(categories)
    .where(eq(categories.status, "visible"))
    .limit(200);
  return rows.map((r) => ({
    id: r.id,
    slug: r.slug,
    name: r.nameAr || r.nameEn || r.slug,
  }));
}

function buildEnrichmentPrompt(title: string, plainText: string, cats: SimpleCategory[]): string {
  const categoryList = cats
    .map((c) => `- "${c.slug}" → ${c.name}`)
    .join("\n");
  const truncatedContent =
    plainText.length > 8000 ? plainText.slice(0, 8000) + "…" : plainText;

  return `أنت محرر متخصص في تجهيز المقالات الصحفية للنشر. عليك تحليل المقال التالي وتوليد البيانات المرافقة (ميتاداتا، ملخصات، تصنيف) دون أي تعديل على العنوان أو المحتوى الأصلي.

العنوان (لا تغيّره — للسياق فقط):
${title}

المحتوى:
${truncatedContent}

التصنيفات المتاحة (اختر الأنسب واحداً منها فقط):
${categoryList}

أعد JSON صالحاً (بدون أي شرح خارجه) بهذه الحقول بالضبط:

{
  "summary": "ملخص احترافي للمقال في 60-100 كلمة، يحفظ السياق الكامل دون رأي شخصي",
  "bullets": ["نقطة 1 مختصرة (15-25 كلمة)", "نقطة 2", "نقطة 3"],
  "keywords": ["كلمة1", "كلمة2", "..."],
  "metaDescription": "وصف SEO 140-160 حرفاً، يحفّز على القراءة دون مبالغة",
  "socialTitle": "عنوان جذاب للمشاركة الاجتماعية، أقل من 60 حرفاً",
  "socialDescription": "وصف للمشاركة الاجتماعية، أقل من 120 حرفاً",
  "imageAltText": "وصف الصورة الرئيسية لقارئ الشاشة (15-25 كلمة)",
  "newsletterSubtitle": "عنوان فرعي للنشرة البريدية، أقل من 80 حرفاً",
  "newsletterExcerpt": "جملة أو جملتان جاذبتان للنشرة البريدية",
  "bestCategorySlug": "اختر slug واحد فقط من القائمة أعلاه",
  "categoryConfidence": 0.0,
  "categoryReason": "جملة قصيرة جداً تشرح اختيار التصنيف"
}

ملاحظات:
- bullets يجب أن تكون 3 نقاط بالضبط.
- keywords بين 5 و 8 كلمات/مصطلحات عربية أو إنجليزية حسب لغة المقال.
- categoryConfidence رقم بين 0.0 و 1.0 يعكس مدى ثقتك بالتصنيف المختار.
- استخدم لغة المقال نفسها (إذا كان عربياً، فالمخرجات عربية).
- لا تضف حقولاً غير مذكورة. لا تضع تعليقات أو نص خارج الـ JSON.`;
}

/**
 * Run the enrichment on a single article. Fire-and-forget from callers.
 * Errors are caught and logged, never thrown to the caller — a half-
 * enriched article is still a valid draft for the reviewer.
 */
export async function enrichArticleAsync(articleId: string): Promise<void> {
  // Defer one tick so the inserting transaction is fully flushed before
  // we read it back.
  await new Promise((r) => setImmediate(r));

  try {
    const [article] = await db
      .select()
      .from(articles)
      .where(eq(articles.id, articleId))
      .limit(1);

    if (!article) {
      console.warn(`[enrich] article ${articleId} not found — skipping`);
      return;
    }

    // Idempotency: don't re-run on already-enriched drafts. The reviewer's
    // manual edits via the dashboard set seoMetadata.manualOverride; we
    // never overwrite their work.
    if (article.aiSummary || article.seoMetadata?.status === "generated") {
      console.log(`[enrich] article ${articleId} already enriched — skip`);
      return;
    }

    const plainText = htmlToPlainText(article.content || "");
    if (plainText.length < 80) {
      console.warn(`[enrich] article ${articleId} content too short (${plainText.length} chars) — skip`);
      return;
    }

    const cats = await loadActiveCategories();
    if (cats.length === 0) {
      console.warn(`[enrich] no categories found — skipping category suggestion`);
    }

    const prompt = buildEnrichmentPrompt(article.title, plainText, cats);
    const startedAt = Date.now();
    const aiResponse = await aiManager.generate(prompt, {
      provider: "openai",
      model: "gpt-4o-mini",
    });
    if (aiResponse.error) {
      throw new Error(`AI enrichment failed: ${aiResponse.error}`);
    }
    const parsed = extractJson(aiResponse.content || "") as EnrichmentJsonShape | null;
    if (!parsed) {
      throw new Error(`AI returned non-JSON content`);
    }
    console.log(
      `[enrich] ${articleId} AI call ok in ${Date.now() - startedAt}ms ` +
      `(summary:${!!parsed.summary} bullets:${parsed.bullets?.length} kw:${parsed.keywords?.length} ` +
      `cat:${parsed.bestCategorySlug} conf:${parsed.categoryConfidence})`,
    );

    // Map suggested category slug → id (server-side, never trust LLM with raw ids).
    const matchedCategory = parsed.bestCategorySlug
      ? cats.find((c) => c.slug === parsed.bestCategorySlug)
      : undefined;

    // Build the SEO + seoMetadata blobs while preserving any pre-existing
    // partial seo on the article (defensive — should be empty on a fresh
    // mobile submit, but harmless to merge).
    const existingSeo = (article.seo as any) || {};
    const newSeo = {
      ...existingSeo,
      metaTitle: existingSeo.metaTitle || article.title,
      metaDescription: parsed.metaDescription || existingSeo.metaDescription,
      keywords: parsed.keywords && parsed.keywords.length > 0 ? parsed.keywords : existingSeo.keywords,
      socialTitle: parsed.socialTitle || existingSeo.socialTitle,
      socialDescription: parsed.socialDescription || existingSeo.socialDescription,
      imageAltText: parsed.imageAltText || existingSeo.imageAltText,
    };

    const newSeoMetadata = {
      ...(article.seoMetadata as any),
      status: "generated" as const,
      version: (article.seoMetadata?.version || 0) + 1,
      generatedAt: new Date().toISOString(),
      generatedBy: "mobile-enrichment",
      provider: "openai" as const,
      model: "gpt-4o-mini",
      manualOverride: false,
    };

    const updates: Record<string, any> = {
      aiSummary: parsed.summary || null,
      aiBullets: parsed.bullets && parsed.bullets.length > 0 ? parsed.bullets.slice(0, 3) : null,
      aiBulletsGeneratedAt: new Date(),
      // Intentionally NOT setting aiGenerated=true here. The article's
      // body was written by a human reporter; only the metadata around
      // it (summary, keywords, SEO, newsletter copy, suggested category)
      // was AI-generated. Flipping aiGenerated on would surface the
      // "محتوى مُنشأ بالذكاء الاصطناعي" disclosure on every mobile-
      // submitted article, which is misleading and was the reason the
      // pill kept appearing on article-detail pages it didn't belong on.
      newsletterSubtitle: parsed.newsletterSubtitle || null,
      newsletterExcerpt: parsed.newsletterExcerpt || null,
      seo: newSeo,
      seoMetadata: newSeoMetadata,
      // Replace the placeholder 220-char excerpt the mobile route set with
      // the AI's polished summary (truncated to fit the excerpt slot).
      excerpt: parsed.summary
        ? (parsed.summary.length > 220 ? parsed.summary.slice(0, 217) + "…" : parsed.summary)
        : article.excerpt,
    };

    if (matchedCategory) {
      // SUGGESTION ONLY per the user's explicit preference — never auto-
      // assign categoryId. The reviewer accepts in the dashboard with a
      // single click.
      updates.suggestedCategoryId = matchedCategory.id;
      updates.categorySuggestionConfidence = typeof parsed.categoryConfidence === "number"
        ? Math.max(0, Math.min(1, parsed.categoryConfidence))
        : 0.5;
      updates.categorySuggestionReason = parsed.categoryReason || null;
    }

    await db.update(articles).set(updates).where(eq(articles.id, articleId));

    // Fire the proofreader. Stored in its own ifox_quality_checks table by
    // the service; the dashboard reads from there. Don't block the
    // enrichment on it — let any failure surface as a console warning.
    void (async () => {
      try {
        await ifoxQualityService.checkArticleQuality({
          articleId,
          title: article.title,
          content: plainText,
          keywords: parsed.keywords,
        });
        console.log(`[enrich] ${articleId} quality check completed`);
      } catch (err: any) {
        console.warn(`[enrich] ${articleId} quality check failed: ${err?.message || err}`);
      }
    })();

    console.log(`[enrich] ${articleId} done in ${Date.now() - startedAt}ms`);
  } catch (err: any) {
    console.error(`[enrich] ${articleId} failed:`, err?.message || err);
  }
}
