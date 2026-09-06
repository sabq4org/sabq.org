import { afterEach, describe, expect, it, vi } from "vitest";
import { apiRequest } from "../../client/src/lib/queryClient";
import { prepareNewsImage } from "../../client/src/lib/browserImageTranscode";
import { uploadNewsImage, newsImageUploadLabel } from "../../client/src/lib/newsImageUpload";

vi.mock("../../client/src/lib/queryClient", () => ({ apiRequest: vi.fn() }));
vi.mock("../../client/src/lib/browserImageTranscode", () => ({ prepareNewsImage: vi.fn() }));

afterEach(() => vi.resetAllMocks());

function payload(purpose = "article-hero") {
  const body = new FormData();
  body.append("file", new File(["original"], "صورة.png", { type: "image/png" }));
  body.append("purpose", purpose);
  body.append("title", "عنوان الصورة");
  body.append("tag", "one");
  body.append("tag", "two");
  return body;
}

describe("news image upload", () => {
  it("keeps metadata and original payload, uses authenticated upload and reports real phases", async () => {
    const original = payload();
    const optimized = new File(["small"], "صورة.webp", { type: "image/webp" });
    vi.mocked(prepareNewsImage).mockResolvedValue(optimized);
    vi.mocked(apiRequest).mockImplementation(async (_url, options) => {
      expect(options?.isFormData).toBe(true);
      const body = options!.body as FormData;
      expect(body.get("file")).toBe(optimized);
      expect(body.get("title")).toBe("عنوان الصورة");
      expect(body.getAll("tag")).toEqual(["one", "two"]);
      options?.onUploadProgress?.({ loaded: 25, total: 100 });
      options?.onUploadProgress?.({ loaded: 100, total: 100 });
      return { id: "media-1", url: "https://media.sabq.org/news/test.webp" };
    });
    const progress = vi.fn();
    await uploadNewsImage(original, progress);
    expect(progress.mock.calls.map(([value]) => value)).toEqual([
      { phase: "preparing", percent: 0 }, { phase: "uploading", percent: 0 },
      { phase: "uploading", percent: 25 }, { phase: "processing", percent: 100 },
    ]);
    expect((original.get("file") as File).name).toBe("صورة.png");
    expect(apiRequest).toHaveBeenCalledTimes(1);
  });

  it.each(["avatar", "logo", "", "publisher"])("does not resize unrelated purpose %s", async purpose => {
    vi.mocked(apiRequest).mockResolvedValue({ url: "https://example.invalid/image" });
    await uploadNewsImage(payload(purpose));
    expect(prepareNewsImage).not.toHaveBeenCalled();
  });

  it.each(["article-inline", "article-album", "article-attachment", "article-library", "article-infographic-banner"])
    ("optimizes editorial purpose %s supplied as entityType", async purpose => {
      const body = payload();
      body.delete("purpose");
      body.set("entityType", purpose);
      vi.mocked(prepareNewsImage).mockResolvedValue(body.get("file") as File);
      vi.mocked(apiRequest).mockResolvedValue({ url: "https://example.invalid/image" });
      await uploadNewsImage(body);
      expect(prepareNewsImage).toHaveBeenCalledTimes(1);
    });

  it.each([null, "<html>error</html>", {}, { url: "" }])("rejects a response without a saved URL", async result => {
    vi.mocked(apiRequest).mockResolvedValue(result);
    await expect(uploadNewsImage(payload("avatar"))).rejects.toThrow("تعذر تأكيد حفظ الصورة");
  });

  it("does not automatically retry a failed upload", async () => {
    vi.mocked(apiRequest).mockRejectedValue(new Error("524: <html>timeout</html>"));
    await expect(uploadNewsImage(payload("avatar"))).rejects.toThrow("تحقق من الاتصال");
    expect(apiRequest).toHaveBeenCalledTimes(1);
  });

  it("retains useful validation messages and distinguishes transfer completion from saving", async () => {
    vi.mocked(apiRequest).mockRejectedValue(new Error("الملف كبير جداً"));
    await expect(uploadNewsImage(payload("avatar"))).rejects.toThrow("الملف كبير جداً");
    expect(newsImageUploadLabel({ phase: "processing", percent: 100 })).toBe("اكتمل الإرسال، جارٍ حفظ الصورة…");
  });
});
