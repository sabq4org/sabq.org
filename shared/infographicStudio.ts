import { z } from "zod";

/**
 * «إنفو للموقع» (Infographic Studio): from the text of a story, the server produces in one job
 * the four parts the editor approved on 2026-11-07: a vertical 1080×1920 infographic, a 1920×1080
 * front image, a headline, and a short text. Nothing is published; the editor applies the result in
 * the article editor.
 */
export const INFOGRAPHIC_STUDIO_FEATURE_KEY = "infographic-studio";
/** Model id stored on `ai_image_generations` rows so the job filter stays narrow. */
export const INFOGRAPHIC_STUDIO_JOB_MODEL = "infographic-studio-v1";
export const INFOGRAPHIC_STUDIO_IMAGE_MODEL = "gpt-image-2.5-sunburst";

export const INFOGRAPHIC_STUDIO_CANVAS = {
  vertical: { width: 1080, height: 1920 },
  wide: { width: 1920, height: 1080 },
} as const;

export const INFOGRAPHIC_HEADLINE_PREFIX = "إنفوجرافيك| ";

export const infographicStudioRequestSchema = z
  .object({
    requestId: z.string().guid(),
    articleId: z.string().trim().max(64).nullish(),
    title: z.string().trim().max(300).optional().default(""),
    content: z.string().trim().min(80, "نص الخبر قصير جدًا لصنع إنفوجرافيك").max(60_000),
  })
  .strict();

export type InfographicStudioRequest = z.infer<typeof infographicStudioRequestSchema>;

export type InfographicStudioStep = "queued" | "brief" | "images" | "render" | "upload" | "done";

export const INFOGRAPHIC_STUDIO_STEP_LABELS: Record<InfographicStudioStep, string> = {
  queued: "في الانتظار",
  brief: "قراءة الخبر واختيار الفكرة",
  images: "توليد الصورة البطلة",
  render: "بناء التصميم وفحصه",
  upload: "حفظ الملفات",
  done: "اكتمل",
};

export interface InfographicStudioFigure {
  value: string;
  label: string;
}

export interface InfographicStudioResult {
  infographicUrl: string;
  bannerUrl: string;
  /** Headline with the «إنفوجرافيك|» prefix, ready for the `title` field. */
  headline: string;
  /** Two short paragraphs as safe HTML (`<p>` only). */
  bodyHtml: string;
  metaphor: string;
  /** Numbers mode: the hero then the supporting figures. Empty in points mode. */
  figures: InfographicStudioFigure[];
  /** Points mode (stories without enough numbers): 3–4 short points. */
  points?: Array<{ title: string; text: string }>;
  /** Layout warnings the automatic check could not fix. The editor reviews them before applying. */
  warnings: string[];
}

export interface InfographicStudioJob {
  id: string;
  status: "processing" | "completed" | "failed";
  step: InfographicStudioStep;
  result: InfographicStudioResult | null;
  error: string | null;
}

/** Adds the «إنفوجرافيك|» prefix once, whatever the model returned. */
export function withInfographicPrefix(headline: string): string {
  const clean = headline
    .replace(/^\s*إنفوجرافيك\s*[|｜:：\-–]\s*/u, "")
    .replace(/\s+/g, " ")
    .trim();
  return `${INFOGRAPHIC_HEADLINE_PREFIX}${clean}`;
}
