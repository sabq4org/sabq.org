// كاشف تركيز الصور: Gemini يعيد مربعات الوجوه والموضوع الرئيسي بدل نقطة واحدة.
//
// يُستدعى من detectImageFocalPoint في server/openai.ts عند إنشاء الخبر أو تغيير صورته
// ومن مسارات الإعادة الجماعية في server/routes/focalPoints.ts.
// النتيجة تُحفظ في articles.image_focal_point (نفس الحقل، حقول إضافية اختيارية)،
// والقص لكل إطار يُحسب في المتصفح عبر shared/imageFocus.ts.
//
// متغيرات البيئة:
//   IMAGE_FOCUS_MODEL   نموذج Gemini (الافتراضي GEMINI_FLASH_MODEL)
//   IMAGE_FOCUS_DETECTOR=legacy  يعيد الكاشف القديم (gpt-4o-mini) فورًا دون حذف كود

import sharp from "sharp";
import { createGoogleGenAI } from "../utils/googleGenAi";
import { GEMINI_FLASH_MODEL, minimalThinkingConfig, withGeminiFlashFallback } from "../ai/geminiModels";
import { assertSafeImageUrl } from "../utils/safeImageUrl";
import { logUsage } from "../ai/gateway/usageLogger";
import { buildFocusFromBoxes, parseFocusResponse, type ImageFocusData } from "@shared/imageFocus";

const FEATURE_KEY = "image-focal-point";
const MAX_SOURCE_BYTES = 15 * 1024 * 1024;
const ANALYSIS_EDGE = 1024;
const FETCH_TIMEOUT_MS = 15_000;

// تسعير تقريبي لكل مليون رمز (مطابق لجدول server/ai/gateway/defaults.ts لـ Flash).
const COST_PER_1M_INPUT = 0.75;
const COST_PER_1M_OUTPUT = 3.75;

const PROMPT = `You locate what must stay visible when a news photo is cropped into small cards and wide banners.

Return JSON only:
{"faces": [[ymin, xmin, ymax, xmax], ...], "subject": [ymin, xmin, ymax, xmax] | null, "description": "short English description"}

Coordinates are integers 0-1000 relative to the full image (y from the top, x from the left).

faces: every clearly visible human face that is a real subject of the photo (not tiny background crowds, not faces printed on posters or screens). Box only the face itself: from the hairline or the top of the forehead to the chin, ear to ear. Headwear such as shemagh, ghutra or niqab is not part of the box. A face covered by a niqab or a mask still counts if the eyes are visible. Return [] when there are none.

subject: the single most important visual subject when faces are empty or tiny (a logo, a building, an object, a vehicle, the action). null only for flat backgrounds.`;

export interface ImageFocusDetection extends ImageFocusData {
  confidence: "high" | "medium" | "low";
  subject: string;
  source: "gemini-box";
}

let client: ReturnType<typeof createGoogleGenAI> | null = null;
function getClient() {
  const apiKey = process.env.AI_INTEGRATIONS_GEMINI_API_KEY || process.env.GEMINI_API_KEY;
  if (!apiKey) return null;
  if (!client) {
    const baseUrl = process.env.AI_INTEGRATIONS_GEMINI_BASE_URL;
    client = createGoogleGenAI({
      apiKey,
      ...(baseUrl ? { httpOptions: { apiVersion: "", baseUrl } } : {}),
    });
  }
  return client;
}

export function isImageFocusDetectorEnabled(): boolean {
  return process.env.IMAGE_FOCUS_DETECTOR !== "legacy" && !!getClient();
}

async function loadImage(imageUrl: string): Promise<{ jpeg: Buffer; iw: number; ih: number }> {
  const safeUrl = assertSafeImageUrl(imageUrl);
  const res = await fetch(safeUrl, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
  if (!res.ok) throw new Error(`image fetch failed: HTTP ${res.status}`);
  const declared = Number(res.headers.get("content-length") || 0);
  if (declared > MAX_SOURCE_BYTES) throw new Error("image too large");
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.byteLength > MAX_SOURCE_BYTES) throw new Error("image too large");
  const img = sharp(buf, { failOn: "none" }).rotate();
  const meta = await img.metadata();
  // بعد rotate() تنقلب الأبعاد لصور EXIF المدوّرة.
  const swap = (meta.orientation ?? 1) >= 5;
  const iw = (swap ? meta.height : meta.width) ?? 0;
  const ih = (swap ? meta.width : meta.height) ?? 0;
  if (!iw || !ih) throw new Error("image has no dimensions");
  const jpeg = await img
    .resize({ width: ANALYSIS_EDGE, height: ANALYSIS_EDGE, fit: "inside", withoutEnlargement: true })
    .jpeg({ quality: 82 })
    .toBuffer();
  return { jpeg, iw, ih };
}

export async function detectImageFocus(imageUrl: string): Promise<ImageFocusDetection> {
  const ai = getClient();
  if (!ai) throw new Error("Gemini key not configured");
  const { jpeg, iw, ih } = await loadImage(imageUrl);
  const started = Date.now();
  const primary = process.env.IMAGE_FOCUS_MODEL?.trim() || GEMINI_FLASH_MODEL;

  let usedModel = primary;
  try {
    const { result: response, model } = await withGeminiFlashFallback(
      FEATURE_KEY,
      (m) =>
        ai.models.generateContent({
          model: m,
          contents: [
            {
              role: "user",
              parts: [{ inlineData: { mimeType: "image/jpeg", data: jpeg.toString("base64") } }, { text: PROMPT }],
            },
          ],
          config: {
            responseMimeType: "application/json",
            maxOutputTokens: 600,
            thinkingConfig: minimalThinkingConfig(m),
          },
        }),
      { primary },
    );
    usedModel = model;
    const usage = response.usageMetadata;
    const inputTokens = usage?.promptTokenCount ?? 0;
    const outputTokens = (usage?.candidatesTokenCount ?? 0) + (usage?.thoughtsTokenCount ?? 0);
    logUsage({
      featureKey: FEATURE_KEY,
      provider: "gemini",
      modelId: model,
      operation: "complete",
      inputTokens,
      outputTokens,
      estimatedCostUsd: (inputTokens * COST_PER_1M_INPUT + outputTokens * COST_PER_1M_OUTPUT) / 1_000_000,
      latencyMs: Date.now() - started,
      status: model === primary ? "success" : "fallback",
    });

    const text = response.text ?? response.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
    const { faces, subject, description } = parseFocusResponse(text);
    const focus = buildFocusFromBoxes({ faces, subject, iw, ih });
    if (!focus) {
      return { x: 50, y: 30, iw, ih, confidence: "low", needsReview: true, subject: description || "no subject", source: "gemini-box" };
    }
    return {
      ...focus,
      confidence: focus.kind === "subject" ? "medium" : "high",
      subject: description || focus.kind || "subject",
      source: "gemini-box",
    };
  } catch (error) {
    logUsage({
      featureKey: FEATURE_KEY,
      provider: "gemini",
      modelId: usedModel,
      operation: "complete",
      latencyMs: Date.now() - started,
      status: "failed",
      errorMessage: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
}
