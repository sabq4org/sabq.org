import OpenAI from "openai";
import type { EditorialImageRequest } from "@shared/editorialImages";

export const OPENAI_IMAGES_TIMEOUT_MS = 150_000;

export class EditorialImageError extends Error {
  constructor(public readonly status: number, public readonly code: string, message: string) {
    super(message);
  }
}

export function areOpenAIImagesConfigured(): boolean {
  return Boolean(process.env.OPENAI_IMAGES_API_KEY?.trim());
}

export function safeImageError(error: unknown): EditorialImageError {
  if (error instanceof EditorialImageError) return error;
  const info = error as { status?: number; code?: string; name?: string } | null;
  if (info?.status === 401) return new EditorialImageError(503, "invalid_key", "مفتاح خدمة صور GPT غير صالح. راجع مسؤول النظام.");
  if (info?.status === 403) return new EditorialImageError(503, "access_denied", "حساب خدمة الصور يحتاج توثيق المؤسسة أو صلاحية الوصول للنموذج.");
  if (info?.status === 404) return new EditorialImageError(503, "model_unavailable", "النموذج المحدد غير متاح لحساب خدمة الصور.");
  if (info?.status === 429) return new EditorialImageError(429, "rate_limit", "وصلت خدمة الصور إلى حد الاستخدام أو الرصيد. حاول لاحقًا أو راجع مسؤول النظام.");
  if (info?.code === "moderation_blocked" || info?.code === "content_policy_violation") return new EditorialImageError(422, "moderation_blocked", "تعذر توليد الصورة بهذا الوصف. عدّل الوصف وحاول مجددًا.");
  if (info?.name === "APIConnectionTimeoutError" || info?.name === "AbortError") return new EditorialImageError(504, "timeout", "انتهت مهلة توليد الصورة. يمكنك بدء محاولة جديدة.");
  return new EditorialImageError(502, "generation_failed", "تعذر إكمال توليد الصورة. حاول مجددًا لاحقًا.");
}

export function buildEditorialImagePrompt(prompt: string): string {
  return [
    "Create a professional editorial illustration for SABQ, an Arabic news publication.",
    "Use a calm, uncluttered composition and generous whitespace. Default palette: white, ink navy #0E2233 and cyan #4CBCFD, unless the brief requires natural subject colors.",
    "This is an illustration, not documentary evidence. Do not invent statistics, quotations, news facts, official seals or a SABQ logo. Preserve factual content from the brief. Do not add text unless explicitly requested in the brief.",
    "Editorial brief:",
    prompt,
  ].join("\n\n");
}

/** Dedicated credentials and endpoint. Never use the general OpenAI/Gemini clients. */
export async function generateOpenAIEditorialImage(input: EditorialImageRequest) {
  const apiKey = process.env.OPENAI_IMAGES_API_KEY?.trim();
  if (!apiKey) throw new EditorialImageError(503, "not_configured", "خدمة صور GPT غير مفعّلة. راجع مسؤول النظام لإعداد مفتاح الصور المخصص.");
  const client = new OpenAI({
    apiKey,
    baseURL: "https://api.openai.com/v1",
    organization: null,
    project: null,
    timeout: OPENAI_IMAGES_TIMEOUT_MS,
    maxRetries: 0,
  });
  const prompt = buildEditorialImagePrompt(input.prompt);
  try {
    const response = await client.images.generate({
      model: input.model,
      prompt,
      // Installed SDK predates GPT Image 2.5 flexible sizes; input is allowlisted.
      size: input.size as OpenAI.Images.ImageGenerateParams["size"],
      quality: input.quality,
      output_format: "png",
      n: 1,
    });
    const encoded = response.data?.[0]?.b64_json;
    if (!encoded) throw new EditorialImageError(502, "empty_image", "لم تُرجع خدمة الصور صورة صالحة. يمكنك المحاولة مجددًا.");
    // Images API returns inline bytes; never fetch provider-controlled URLs.
    const buffer = Buffer.from(encoded, "base64");
    if (buffer.length > 32 * 1024 * 1024 || buffer.length < 8 || buffer.subarray(0, 8).toString("hex") !== "89504e470d0a1a0a") {
      throw new EditorialImageError(502, "invalid_image", "أعادت خدمة الصور ملفًا غير صالح.");
    }
    return { buffer, prompt, usage: response.usage ?? null, requestId: response._request_id ?? null };
  } catch (error) {
    throw safeImageError(error);
  }
}
