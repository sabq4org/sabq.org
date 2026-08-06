import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../server/db", () => ({ db: {} }));

import {
  activeSocialTransport,
  listPublerAccounts,
  pollPublerJob,
  publerConfigured,
  publishToPublerAccount,
  resolvePublishedPostLink,
  uploadImageToPubler,
} from "../../server/services/socialPublishing/publerApiClient";
import { getProvider } from "../../server/services/socialPublishing/socialPublishingService";
import { SocialProviderError } from "../../server/services/socialPublishing/types";

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("publerApiClient — التهيئة وتبديل وسيلة النقل", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("publerConfigured يعكس وجود المفتاح والworkspace معاً", () => {
    vi.stubEnv("PUBLER_API_KEY", "k");
    vi.stubEnv("PUBLER_WORKSPACE_ID", "");
    expect(publerConfigured()).toBe(false);
    vi.stubEnv("PUBLER_WORKSPACE_ID", "w");
    expect(publerConfigured()).toBe(true);
  });

  it("وسيلة النقل publer تتطلب الاختيار الصريح والتهيئة معاً", () => {
    vi.stubEnv("PUBLER_API_KEY", "k");
    vi.stubEnv("PUBLER_WORKSPACE_ID", "w");
    vi.stubEnv("SOCIAL_PUBLISH_TRANSPORT", "");
    expect(activeSocialTransport()).toBe("x_api");
    vi.stubEnv("SOCIAL_PUBLISH_TRANSPORT", "publer");
    expect(activeSocialTransport()).toBe("publer");
    vi.stubEnv("PUBLER_API_KEY", "");
    expect(activeSocialTransport()).toBe("x_api");
  });

  it("getProvider('x') يتبع وسيلة النقل — الرجوع للمباشر بلا كود", () => {
    vi.stubEnv("PUBLER_API_KEY", "k");
    vi.stubEnv("PUBLER_WORKSPACE_ID", "w");
    vi.stubEnv("SOCIAL_PUBLISH_TRANSPORT", "publer");
    expect(getProvider("x").platform).toBe("x");
    const publer = getProvider("x");
    vi.stubEnv("SOCIAL_PUBLISH_TRANSPORT", "");
    const direct = getProvider("x");
    expect(direct).not.toBe(publer);
  });
});

describe("publerApiClient — الوسائط والنشر", () => {
  beforeEach(() => {
    vi.stubEnv("PUBLER_API_KEY", "test-key");
    vi.stubEnv("PUBLER_WORKSPACE_ID", "ws-1");
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("رفع الصورة multipart بحقل file ويعيد المعرف ويحمل رأسي Publer", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(200, { id: "media-1" }));
    vi.stubGlobal("fetch", fetchMock);
    const id = await uploadImageToPubler({ buffer: Buffer.from("img"), mimeType: "image/jpeg" });
    expect(id).toBe("media-1");
    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toContain("/api/v1/media");
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer-API test-key");
    expect((init.headers as Record<string, string>)["Publer-Workspace-Id"]).toBe("ws-1");
    expect(init.body).toBeInstanceOf(FormData);
    expect((init.body as FormData).get("file")).toBeInstanceOf(Blob);
  });

  it("النشر الفوري: bulk.state=scheduled بلا scheduled_at ثم poll حتى الاكتمال", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(200, { data: { job_id: "job-9" } }))
      .mockResolvedValueOnce(jsonResponse(200, { data: { status: "working" } }))
      .mockResolvedValueOnce(
        jsonResponse(200, { data: { status: "complete", result: { payload: { failures: {} } } } }),
      );
    vi.stubGlobal("fetch", fetchMock);
    const { jobId } = await publishToPublerAccount("acc-1", {
      text: "خبر عاجل",
      mediaIds: ["m1"],
      pollOptions: { intervalMs: 1, timeoutMs: 1000 },
    });
    expect(jobId).toBe("job-9");
    const body = JSON.parse(fetchMock.mock.calls[0][1].body as string);
    expect(body.bulk.state).toBe("scheduled");
    expect(body.bulk.posts[0].networks.twitter.type).toBe("photo");
    expect(body.bulk.posts[0].networks.twitter.media).toEqual([{ id: "m1", type: "image" }]);
    expect(body.bulk.posts[0].accounts).toEqual([{ id: "acc-1" }]);
    expect(body.bulk.posts[0].accounts[0].scheduled_at).toBeUndefined();
  });

  it("بلا صورة يكون النوع status", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(200, { data: { job_id: "job-2" } }))
      .mockResolvedValueOnce(jsonResponse(200, { data: { status: "complete" } }));
    vi.stubGlobal("fetch", fetchMock);
    await publishToPublerAccount("acc-1", { text: "نص", pollOptions: { intervalMs: 1 } });
    const body = JSON.parse(fetchMock.mock.calls[0][1].body as string);
    expect(body.bulk.posts[0].networks.twitter.type).toBe("status");
    expect(body.bulk.posts[0].networks.twitter.media).toBeUndefined();
  });

  it("failures غير الفارغة في المهمة المكتملة = فشل دائم", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(200, { data: { job_id: "job-3" } }))
      .mockResolvedValueOnce(
        jsonResponse(200, {
          data: { status: "complete", result: { payload: { failures: { "acc-1": "duplicate" } } } },
        }),
      );
    vi.stubGlobal("fetch", fetchMock);
    await expect(
      publishToPublerAccount("acc-1", { text: "نص", pollOptions: { intervalMs: 1 } }),
    ).rejects.toSatisfy((err: any) => {
      expect(err).toBeInstanceOf(SocialProviderError);
      expect(err.opts.retryable).toBe(false);
      return true;
    });
  });

  it("مهلة الاستطلاع خطأ دائم — لا إعادة آلية تخاطر بالتكرار", async () => {
    // Response جديد لكل نداء — الجسم يُستهلك مرة واحدة فقط
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation(async () => jsonResponse(200, { data: { status: "working" } })),
    );
    try {
      await pollPublerJob("job-4", { intervalMs: 1, timeoutMs: 5 });
      expect.unreachable("كان يجب أن يرمي");
    } catch (err) {
      expect((err as SocialProviderError).opts.retryable).toBe(false);
    }
  });

  it("429 من Publer مؤقت و401 دائم برسالة تشير للمفتاح", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse(429, {})));
    try {
      await listPublerAccounts();
      expect.unreachable("كان يجب أن يرمي");
    } catch (err) {
      expect((err as SocialProviderError).opts.retryable).toBe(true);
    }
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse(401, { error: "bad key" })));
    try {
      await listPublerAccounts();
      expect.unreachable("كان يجب أن يرمي");
    } catch (err) {
      const pErr = err as SocialProviderError;
      expect(pErr.opts.retryable).toBe(false);
      expect(pErr.message).toContain("PUBLER_API_KEY");
    }
  });

  it("حل رابط المنشور: مطابقة النص تعيد post_link والفشل يعيد null بلا رمي", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        jsonResponse(200, {
          posts: [
            { id: "p1", text: "خبر آخر", post_link: "https://x.com/sabqorg/status/1" },
            { id: "p2", text: "خبر عاجل من سبق", post_link: "https://x.com/sabqorg/status/2" },
          ],
        }),
      ),
    );
    const hit = await resolvePublishedPostLink("acc-1", "خبر عاجل من سبق");
    expect(hit).toEqual({ postId: "p2", postLink: "https://x.com/sabqorg/status/2" });

    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("boom")));
    expect(await resolvePublishedPostLink("acc-1", "أي نص")).toBeNull();
  });
});
