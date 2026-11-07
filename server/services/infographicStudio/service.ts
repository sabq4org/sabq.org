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
import { generateInfographicBrief, heroPrompt, InfographicBriefError, type InfographicBrief } from "./brief";
import { buildBodyHtml, buildVerticalHtml, buildWideHtml, withSafeColours, type TemplateAssets } from "./templates";
import { layoutProblems, renderCanvases } from "./render";

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
        numImages: 2,
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
  assetsCache = {
    logoWhiteSvg: logo,
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

    const [tall, wide] = await Promise.all([
      generateOpenAIEditorialImage({ requestId: randomUUID(), prompt: heroPrompt(brief, "vertical"), model: INFOGRAPHIC_STUDIO_IMAGE_MODEL, size: "1024x1536", quality: "high" }),
      generateOpenAIEditorialImage({ requestId: randomUUID(), prompt: heroPrompt(brief, "wide"), model: INFOGRAPHIC_STUDIO_IMAGE_MODEL, size: "1536x864", quality: "high" }),
    ]);
    await setStep(id, userId, "render");

    const assets = loadAssets();
    const v = INFOGRAPHIC_STUDIO_CANVAS.vertical;
    const w = INFOGRAPHIC_STUDIO_CANVAS.wide;
    const [vertical, banner] = await renderCanvases([
      { html: buildVerticalHtml(brief, { ...assets, heroDataUri: await coverDataUri(tall.buffer, v.width, v.height) }), ...v },
      { html: buildWideHtml(brief, { ...assets, heroDataUri: await coverDataUri(wide.buffer, w.width, w.height) }), ...w },
    ]);
    const checks = [layoutProblems(vertical.report), layoutProblems(banner.report)];
    const hard = checks.flatMap((c) => c.hard);
    if (hard.length) throw new InfographicStudioError(422, "layout_failed", `لم يجتز التصميم الفحص: ${hard.join("؛ ")}`);
    const warnings = Array.from(new Set(checks.flatMap((c) => c.warnings)));

    await setStep(id, userId, "upload");
    const [infographicUrl, bannerUrl] = await Promise.all([upload(id, "infographic", vertical.png), upload(id, "banner", banner.png)]);
    const result: InfographicStudioResult = {
      infographicUrl,
      bannerUrl,
      headline: withInfographicPrefix(brief.headline),
      bodyHtml: buildBodyHtml(brief.body),
      metaphor: brief.metaphor,
      figures: [{ value: brief.hero.value, label: [brief.hero.unit, brief.hero.caption].filter(Boolean).join(" ") }, ...brief.figures],
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
        metadata: sql`coalesce(${aiImageGenerations.metadata}, '{}'::jsonb) || ${JSON.stringify({ step: "done", result, imagePrompts: [tall.prompt, wide.prompt] })}::jsonb`,
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
