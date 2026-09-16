/** Reduce mobile uploads; keep PDFs and undecodable images unchanged. */
export async function prepareRegistrationImage(file: File, maxDimension: number): Promise<File> {
  if (!file.type.startsWith("image/") || file.size <= 300 * 1024) return file;

  const url = URL.createObjectURL(file);
  const image = new Image();
  const canvas = document.createElement("canvas");
  try {
    image.src = url;
    await image.decode();
    if (!image.naturalWidth || !image.naturalHeight) return file;
    const scale = Math.min(1, maxDimension / Math.max(image.naturalWidth, image.naturalHeight));
    canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
    const context = canvas.getContext("2d");
    if (!context) return file;
    context.fillStyle = "#fff";
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.9));
    if (!blob || blob.size >= file.size) return file;
    return new File([blob], `${file.name.replace(/\.[^.]+$/, "")}.jpg`, {
      type: "image/jpeg", lastModified: file.lastModified,
    });
  } catch {
    // Some browsers cannot decode HEIC; the server still supports the original.
    return file;
  } finally {
    URL.revokeObjectURL(url);
    canvas.width = canvas.height = 0;
  }
}

export const REGISTRATION_CONNECTION_ERROR =
  "تعذر تأكيد إرسال الطلب بسبب انقطاع الاتصال. بياناتك ما زالت في النموذج؛ تحقق من اتصالك وحاول بعد قليل.";

function responseError(status: number): string {
  if (status === 413) return "حجم المرفقات كبير. اختر ملفات أصغر ثم أعد تقديم الطلب.";
  if (status === 429) return "تم تجاوز عدد المحاولات. انتظر قليلاً ثم حاول مجدداً.";
  if (status === 403) return "تعذر إتمام التحقق من الطلب. حاول مجدداً بعد قليل.";
  if (status >= 500 || status === 408) return REGISTRATION_CONNECTION_ERROR;
  return "تعذر تأكيد استلام الطلب. بياناتك ما زالت في النموذج؛ حاول بعد قليل.";
}

export async function readRegistrationResponse(response: Response): Promise<{ applicationId: string; message: string }> {
  // Error pages from the upload proxy are often HTML. Safari's response.json()
  // then throws the unhelpful “string did not match the expected pattern”.
  const result: unknown = await response.json().catch(() => null);
  const data = result && typeof result === "object" ? result as Record<string, unknown> : null;
  if (!response.ok) {
    throw new Error(typeof data?.message === "string" && data.message.trim()
      ? data.message : responseError(response.status));
  }
  // A 200 HTML page (or malformed JSON) is never evidence of a saved application.
  if (typeof data?.applicationId !== "string" || !data.applicationId.trim()) {
    throw new Error(responseError(response.status));
  }
  return {
    applicationId: data.applicationId,
    message: typeof data.message === "string" ? data.message : "تم تقديم طلبك بنجاح.",
  };
}
