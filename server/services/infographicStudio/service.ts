/**
 * «إنفو للموقع» — job lifecycle. Jobs live in `ai_image_generations` (model `infographic-studio-v1`,
 * metadata.featureKey `infographic-studio`), the same persisted-job pattern as GPT editor images, so any
 * replica can answer polling and no new table or migration is needed. One active job per user; a job
 * older than the TTL is marked failed when read.
 */
import { randomUUID } from "crypto";
import fs from "fs";
import path from "path";
import sharp from "sharp";
import { and, eq, gte, lt, sql } from "drizzle-orm";
import { db } from "../../db";
import { aiImageGenerations } from "@shared/schema";
import {
  INFOGRAPHIC_STUDIO_CANVAS,
  INFOGRAPHIC_STUDIO_FEATURE_KEY,
  INFOGRAPHIC_STUDIO_IMAGE_MODEL,
  INFOGRAPHIC_STUDIO_JOB_MODEL,
  withInfographicPrefix,
  type InfographicStudioJob,
  type InfographicStudioRequest,
  type InfographicStudioResult,
  type InfographicStudioStep,
} from "@shared/infographicStudio";
import { newsImageStorageService } from "../newsImageStorageService";
import { areOpenAIImagesConfigured, EditorialImageError, generateOpenAIEditorialImage } from "../openaiImagesProvider";
import { generateInfographicBrief, heroPrompt, InfographicBriefError, numbersFromStory, numbersOk, type InfographicBrief } from "./brief";
import {
  buildBodyHtml,
  buildDesignedHtml,
  buildVerticalHtml,
  buildWideHtml,
  verticalPhotoHeight,
  WIDE_PHOTO_WIDTH,
  withSafeColours,
  type TemplateAssets,
} from "./templates";
import { layoutProblems, renderCanvases, type RenderedCanvas } from "./render";
import {
  designContractProblems,
  designMessages,
  repairMessage,
  requestDesign,
  sanitizeDesignCss,
  sanitizeDesignHtml,
  type InfographicDesign,
} from "./designer";

export const INFOGRAPHIC_STUDIO_JOB_TTL_MS = 12 * 60_000;
const expiredMessage = "انتهت العملية قبل اكتمالها. يمكنك بدء محاولة جديدة.";
const featureFilter = sql`${aiImageGenerations.metadata}->>'featureKey' = ${INFOGRAPHIC_STUDIO_FEATURE_KEY}`;
const jobFilter = and(eq(aiImageGenerations.model, INFOGRAPHIC_STUDIO_JOB_MODEL), featureFilter);
const cutoff = () => sql`localtimestamp - (${INFOGRAPHIC_STUDIO_JOB_TTL_MS} * interval '1 millisecond')`;

type JobRow = typeof aiImageGenerations.$inferSelect;
interface JobMeta {
  featureKey: string;
  step?: InfographicStudioStep;
  result?: InfographicStudioResult;
  brief?: InfographicBrief;
}

export class InfographicStudioError extends Error {
  constructor(public readonly status: number, public readonly code: string, message: string) {
    super(message);
  }
}

function publicJob(row: JobRow): InfographicStudioJob {
  const meta = (row.metadata ?? {}) as JobMeta;
  const status = row.status === "completed" ? "completed" : row.status === "failed" ? "failed" : "processing";
  return {
    id: row.id,
    status,
    step: status === "completed" ? "done" : meta.step ?? "queued",
    result: status === "completed" ? meta.result ?? null : null,
    error: status === "failed" ? row.errorMessage : null,
  };
}

export function isInfographicStudioConfigured(): boolean {
  return areOpenAIImagesConfigured();
}

export async function createInfographicStudioJob(userId: string, input: InfographicStudioRequest) {
  if (!isInfographicStudioConfigured()) {
    throw new InfographicStudioError(503, "not_configured", "خدمة صور GPT غير مفعّلة. راجع مسؤول النظام لإعداد مفتاح الصور المخصص.");
  }
  return db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${`infographic-studio:${userId}`}, 0))`);
    const [existing] = await tx.select().from(aiImageGenerations).where(and(eq(aiImageGenerations.id, input.requestId), eq(aiImageGenerations.userId, userId), jobFilter));
    if (existing) return { job: publicJob(existing), created: false };
    await tx
      .update(aiImageGenerations)
      .set({ status: "failed", errorMessage: expiredMessage, updatedAt: new Date() })
      .where(and(eq(aiImageGenerations.userId, userId), jobFilter, eq(aiImageGenerations.status, "processing"), lt(aiImageGenerations.createdAt, cutoff())));
    const [active] = await tx
      .select({ id: aiImageGenerations.id })
      .from(aiImageGenerations)
      .where(and(eq(aiImageGenerations.userId, userId), jobFilter, eq(aiImageGenerations.status, "processing"), gte(aiImageGenerations.createdAt, cutoff())))
      .limit(1);
    if (active) throw new InfographicStudioError(409, "already_processing", "لديك إنفوجرافيك قيد الإنتاج. انتظر اكتماله قبل بدء طلب جديد.");
    const [row] = await tx
      .insert(aiImageGenerations)
      .values({
        id: input.requestId,
        userId,
        prompt: input.title.slice(0, 300),
        model: INFOGRAPHIC_STUDIO_JOB_MODEL,
        aspectRatio: "9:16",
        imageSize: "2K",
        numImages: 1,
        status: "processing",
        enableSearchGrounding: false,
        enableThinking: false,
        metadata: { featureKey: INFOGRAPHIC_STUDIO_FEATURE_KEY, step: "queued" } satisfies JobMeta,
      })
      .returning();
    return { job: publicJob(row), created: true };
  });
}

export async function getInfographicStudioJob(userId: string, id: string): Promise<InfographicStudioJob | null> {
  const filter = and(eq(aiImageGenerations.id, id), eq(aiImageGenerations.userId, userId), jobFilter);
  await db
    .update(aiImageGenerations)
    .set({ status: "failed", errorMessage: expiredMessage, updatedAt: new Date() })
    .where(and(filter, eq(aiImageGenerations.status, "processing"), lt(aiImageGenerations.createdAt, cutoff())));
  const [row] = await db.select().from(aiImageGenerations).where(filter);
  return row ? publicJob(row) : null;
}

let assetsCache: Omit<TemplateAssets, "heroDataUri"> | null = null;
function loadAssets(): Omit<TemplateAssets, "heroDataUri"> {
  if (assetsCache) return assetsCache;
  const fonts = path.resolve(process.cwd(), "server/fonts");
  const uri = (file: string, mime: string) => `data:${mime};base64,${fs.readFileSync(path.join(fonts, file)).toString("base64")}`;
  const logo = fs
    .readFileSync(path.resolve(process.cwd(), "public/branding/identity/sabq-logo-white.svg"), "utf8")
    .replace(/<\?xml[^>]*>/, "")
    .replace(/<metadata>[\s\S]*?<\/metadata>/, "");
  const logoColor = fs
    .readFileSync(path.resolve(process.cwd(), "public/branding/identity/sabq-logo.svg"), "utf8")
    .replace(/<\?xml[^>]*>/, "")
    .replace(/<metadata>[\s\S]*?<\/metadata>/, "");
  assetsCache = {
    logoWhiteSvg: logo,
    logoColorSvg: logoColor,
    fonts: {
      handicraftsBlack: uri("infographic/TheYearofHandicrafts-Black.otf", "font/otf"),
      alexandriaArabic: uri("infographic/Alexandria-arabic.woff2", "font/woff2"),
      alexandriaLatin: uri("infographic/Alexandria-latin.woff2", "font/woff2"),
      plexSemiBold: uri("IBMPlexSansArabic-SemiBold.ttf", "font/ttf"),
      plexRegular: uri("IBMPlexSansArabic-Regular.ttf", "font/ttf"),
    },
  };
  return assetsCache;
}

async function setStep(id: string, userId: string, step: InfographicStudioStep, extra: Partial<JobMeta> = {}) {
  await db
    .update(aiImageGenerations)
    .set({
      metadata: sql`coalesce(${aiImageGenerations.metadata}, '{}'::jsonb) || ${JSON.stringify({ step, ...extra })}::jsonb`,
      updatedAt: new Date(),
    })
    .where(and(eq(aiImageGenerations.id, id), eq(aiImageGenerations.userId, userId), eq(aiImageGenerations.status, "processing"), jobFilter));
}

async function coverDataUri(png: Buffer, width: number, height: number): Promise<string> {
  const jpeg = await sharp(png).resize(width, height, { fit: "cover", position: "centre" }).jpeg({ quality: 90 }).toBuffer();
  return `data:image/jpeg;base64,${jpeg.toString("base64")}`;
}

async function upload(id: string, kind: "infographic" | "banner", png: Buffer): Promise<string> {
  const uploaded = await newsImageStorageService.upload({
    buffer: png,
    filename: `infographic-${kind}-${id}.png`,
    mimeType: "image/png",
    purpose: "article-infographic-ai-generated",
    rolloutKey: `${id}-${kind}`,
    metadata: { generationId: id, isAiGenerated: "true", kind },
  });
  if (!uploaded.success || !uploaded.deliveryUrl) throw new InfographicStudioError(502, "upload_failed", "اكتمل التصميم لكن تعذر حفظ الملفات. حاول مجددًا.");
  return uploaded.deliveryUrl;
}

/** House rules every generated photo carries, whatever the art director wrote. */
function designedImagePrompt(prompt: string): string {
  return [
    "Photorealistic editorial photograph, natural colours, cinematic soft light, high detail.",
    prompt,
    "No text, letters, numbers, logos, watermarks or flags. No recognisable real people. No religious holy sites.",
  ].join("\n");
}

/**
 * A designed canvas is accepted only when it renders cleanly: fonts, nothing outside its zone or the
 * canvas, no overlapping text blocks, and every number in the visible text found in the story.
 */
export function designedCanvasProblems(canvases: RenderedCanvas[], source: string): string[] {
  const problems: string[] = [];
  canvases.forEach((c, i) => {
    const name = i === 0 ? "vertical" : "wide";
    const { hard } = layoutProblems(c.report);
    hard.forEach((h) => problems.push(`${name}: ${h}`));
    if (c.report.overlaps.length) problems.push(`${name}: overlapping text blocks ${c.report.overlaps.join(", ")}`);
    if (c.report.lowContrast.length) problems.push(`${name}: weak contrast under ${c.report.lowContrast.join(", ")}; add a scrim or move the text to a calm area`);
    if (c.report.titleLines > 2) problems.push(`${name}: the title runs to ${c.report.titleLines} lines; keep it to two`);
    const lines = c.text.split(/\n+/).filter((l) => /[0-9٠-٩]/.test(l) && !/sabq\.org/.test(l));
    const bad = lines.filter((l) => !numbersOk(l, source));
    if (bad.length) problems.push(`${name}: numbers not in the story: ${bad.slice(0, 3).join(" | ")}`);
    const lowerSource = source.toLowerCase();
    const latin = (c.text.replace(/sabq\.org/gi, "").match(/[A-Za-z]{3,}/g) ?? []).filter((word) => !lowerSource.includes(word.toLowerCase()));
    if (latin.length) problems.push(`${name}: Latin words that are not in the story: ${latin.slice(0, 5).join(", ")}`);
  });
  return problems;
}

/** Runs after the 202 response; every outcome is persisted on the job row. */
export async function runInfographicStudioJob(userId: string, input: InfographicStudioRequest): Promise<void> {
  const id = input.requestId;
  const started = Date.now();
  const filter = and(eq(aiImageGenerations.id, id), eq(aiImageGenerations.userId, userId), eq(aiImageGenerations.status, "processing"), jobFilter);
  try {
    await setStep(id, userId, "brief");
    const generated = await generateInfographicBrief({ title: input.title, content: input.content }, userId);
    const brief = withSafeColours(generated.brief);
    await setStep(id, userId, "images", { brief });

    const assets = loadAssets();
    const v = INFOGRAPHIC_STUDIO_CANVAS.vertical;
    const w = INFOGRAPHIC_STUDIO_CANVAS.wide;
    const story = generated.source;

    // Art director: the model designs both canvases from Sabq's guide. Any failure falls back to the template.
    await setStep(id, userId, "design");
    let design: InfographicDesign | null = null;
    let conversation = designMessages(brief, story);
    try {
      const first = await requestDesign(conversation, userId);
      design = first.design;
      conversation = [...conversation, { role: "assistant", content: first.raw }];
      if (design && designContractProblems(design).length) {
        const fix = await requestDesign([...conversation, repairMessage(designContractProblems(design))], userId);
        conversation = [...conversation, repairMessage(designContractProblems(design)), { role: "assistant", content: fix.raw }];
        design = fix.design && !designContractProblems(fix.design).length ? { ...fix.design, imageVertical: design.imageVertical, imageWide: design.imageWide } : null;
      }
    } catch (error) {
      console.warn("[infographic-studio] design step failed", { generationId: id, error: (error as Error)?.message });
      design = null;
    }

    await setStep(id, userId, "images");
    const designed = design;
    const [tall, wide] = designed
      ? await Promise.all([
          generateOpenAIEditorialImage({ requestId: randomUUID(), prompt: designedImagePrompt(designed.imageVertical), model: INFOGRAPHIC_STUDIO_IMAGE_MODEL, size: "1024x1536", quality: "high" }),
          generateOpenAIEditorialImage({ requestId: randomUUID(), prompt: designedImagePrompt(designed.imageWide), model: INFOGRAPHIC_STUDIO_IMAGE_MODEL, size: "1536x864", quality: "high" }),
        ])
      : await generateOpenAIEditorialImage({ requestId: randomUUID(), prompt: heroPrompt(brief), model: INFOGRAPHIC_STUDIO_IMAGE_MODEL, size: "1024x1024", quality: "high" }).then((p) => [p, p] as const);
    await setStep(id, userId, "render");

    const tallUri = await coverDataUri(tall.buffer, v.width, v.height);
    const wideUri = await coverDataUri(wide.buffer, w.width, w.height);
    const source = numbersFromStory(story);
    const renderDesign = (d: InfographicDesign) =>
      renderCanvases([
        { html: buildDesignedHtml(brief, { ...assets, heroDataUri: tallUri }, "vertical", { css: sanitizeDesignCss(d.cssVertical), html: sanitizeDesignHtml(d.htmlVertical) }), ...v },
        { html: buildDesignedHtml(brief, { ...assets, heroDataUri: wideUri }, "wide", { css: sanitizeDesignCss(d.cssWide), html: sanitizeDesignHtml(d.htmlWide) }), ...w },
      ]);

    let canvases: RenderedCanvas[] | null = null;
    let fallbackNote = "";
    if (designed) {
      let current: InfographicDesign = designed;
      for (let attempt = 0; attempt < 2 && !canvases; attempt++) {
        const out = await renderDesign(current);
        const problems = designedCanvasProblems(out, source);
        if (!problems.length) {
          canvases = out;
          break;
        }
        console.warn("[infographic-studio] designed canvas refused", JSON.stringify({ generationId: id, attempt, problems: problems.slice(0, 8) }));
        if (attempt === 1) break;
        try {
          const fix = await requestDesign([...conversation, repairMessage(problems)], userId);
          if (!fix.design || designContractProblems(fix.design).length) break;
          current = { ...fix.design, imageVertical: current.imageVertical, imageWide: current.imageWide };
        } catch {
          break;
        }
      }
      if (!canvases) fallbackNote = "تعذر اعتماد التصميم الإبداعي فاستُخدم القالب الثابت؛ يمكنك إعادة التصميم.";
    }
    if (!canvases) {
      canvases = await renderCanvases([
        { html: buildVerticalHtml(brief, { ...assets, heroDataUri: await coverDataUri(tall.buffer, v.width, verticalPhotoHeight(brief)) }), ...v },
        { html: buildWideHtml(brief, { ...assets, heroDataUri: await coverDataUri(wide.buffer, WIDE_PHOTO_WIDTH, w.height) }), ...w },
      ]);
    }
    const [vertical, banner] = canvases;
    const checks = [layoutProblems(vertical.report), layoutProblems(banner.report)];
    const hard = checks.flatMap((c) => c.hard);
    if (hard.length) throw new InfographicStudioError(422, "layout_failed", `لم يجتز التصميم الفحص: ${hard.join("؛ ")}`);
    const warnings = Array.from(new Set([...(fallbackNote ? [fallbackNote] : []), ...checks.flatMap((c) => c.warnings)]));

    await setStep(id, userId, "upload");
    const [infographicUrl, bannerUrl] = await Promise.all([upload(id, "infographic", vertical.png), upload(id, "banner", banner.png)]);
    const result: InfographicStudioResult = {
      infographicUrl,
      bannerUrl,
      headline: withInfographicPrefix(brief.headline),
      bodyHtml: buildBodyHtml(brief.body),
      metaphor: design?.concept || brief.metaphor,
      figures: [
        ...(brief.hero ? [{ value: brief.hero.value, label: [brief.hero.unit, brief.hero.caption].filter(Boolean).join(" ") }] : []),
        ...brief.figures,
      ],
      points: brief.points,
      warnings,
    };
    await db
      .update(aiImageGenerations)
      .set({
        status: "completed",
        imageUrl: infographicUrl,
        thumbnailUrl: bannerUrl,
        generationTime: Math.round((Date.now() - started) / 1000),
        updatedAt: new Date(),
        metadata: sql`coalesce(${aiImageGenerations.metadata}, '{}'::jsonb) || ${JSON.stringify({ step: "done", result, imagePrompts: [tall.prompt, wide.prompt], design: design ? { concept: design.concept } : null })}::jsonb`,
      })
      .where(filter);
  } catch (error) {
    const message =
      error instanceof InfographicStudioError || error instanceof InfographicBriefError || error instanceof EditorialImageError
        ? error.message
        : "تعذر إكمال الإنفوجرافيك. حاول مجددًا.";
    console.warn("[infographic-studio] failed", { generationId: id, error: (error as Error)?.message });
    await db
      .update(aiImageGenerations)
      .set({ status: "failed", errorMessage: message, generationTime: Math.round((Date.now() - started) / 1000), updatedAt: new Date() })
      .where(filter);
  }
}
