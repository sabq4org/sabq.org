import { apiRequest } from "@/lib/queryClient";
import { prepareNewsImage } from "@/lib/browserImageTranscode";

export type NewsImageUploadProgress = {
  phase: "preparing" | "uploading" | "processing";
  percent: number;
};

export function newsImageUploadLabel(progress: NewsImageUploadProgress): string {
  if (progress.phase === "preparing") return "جارٍ تجهيز الصورة…";
  if (progress.phase === "processing") return "اكتمل الإرسال، جارٍ حفظ الصورة…";
  return `جارٍ رفع الصورة… ${progress.percent}%`;
}

/** Same authenticated upload contract; only explicit article images are resized. */
export async function uploadNewsImage<T>(
  original: FormData,
  onProgress: (progress: NewsImageUploadProgress) => void = () => {},
): Promise<T> {
  const body = new FormData();
  original.forEach((value, key) => body.append(key, value));
  const file = body.get("file");
  const purpose = String(body.get("purpose") || body.get("entityType") || "");
  if (file instanceof File && /^(?:article|en-article|ur-article)(?:-|$)/.test(purpose)) {
    onProgress({ phase: "preparing", percent: 0 });
    body.set("file", await prepareNewsImage(file));
  }
  onProgress({ phase: "uploading", percent: 0 });
  try {
    const result = await apiRequest<T>("/api/media/upload", {
      method: "POST", body, isFormData: true,
      onUploadProgress: ({ loaded, total }) => {
        if (total <= 0) return;
        const percent = Math.max(0, Math.min(100, Math.floor(loaded / total * 100)));
        onProgress({ phase: loaded >= total ? "processing" : "uploading", percent });
      },
    });
    if (!result || typeof result !== "object" || !("url" in result) || typeof result.url !== "string" || !result.url.trim()) {
      throw new Error("تعذر تأكيد حفظ الصورة. يرجى المحاولة مرة أخرى.");
    }
    return result;
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (/Network error|Failed to parse response|^\d{3}:|<html|<!doctype/i.test(message)) {
      throw new Error("تعذر إكمال رفع الصورة. تحقق من الاتصال وحاول مرة أخرى.");
    }
    throw error;
  }
}
