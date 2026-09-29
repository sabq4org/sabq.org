import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../server/db", () => ({ db: {} }));

import {
  activeSocialTransport,
  buildPublerExternalRef,
  extractMediaIdFromJobPayload,
  findXStatusInJobPayload,
  listPublerAccounts,
  needsPublerStatusBackfill,
  parseXStatusUrl,
  pollPublerJob,
  publerConfigured,
  publishToPublerAccount,
  resolveExternalRefAfterPublerJob,
  resolvePublishedPostLink,
  uploadImageToPubler,
  uploadVideoToPublerFromUrl,
  xProfileUrlFromHandle,
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

  it("فيديو واحد: النوع video والوسائط entry واحدة", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(200, { data: { job_id: "job-v" } }))
      .mockResolvedValueOnce(jsonResponse(200, { data: { status: "complete" } }));
    vi.stubGlobal("fetch", fetchMock);
    await publishToPublerAccount("acc-1", {
      text: "فيديو",
      videoMediaId: "vid-1",
      pollOptions: { intervalMs: 1 },
    });
    const body = JSON.parse(fetchMock.mock.calls[0][1].body as string);
    expect(body.bulk.posts[0].networks.twitter.type).toBe("video");
    expect(body.bulk.posts[0].networks.twitter.media).toEqual([{ id: "vid-1", type: "video" }]);
  });

  it("رفع الفيديو من رابط: from-url ثم poll واستخراج معرف الوسائط", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(200, { job_id: "job-m" }))
      .mockResolvedValueOnce(
        jsonResponse(200, {
          data: { status: "complete", result: { payload: { media: [{ id: "media-vid" }] } } },
        }),
      );
    vi.stubGlobal("fetch", fetchMock);
    const id = await uploadVideoToPublerFromUrl("https://storage.googleapis.com/x/v.mp4", {
      intervalMs: 1,
      timeoutMs: 1000,
    });
    expect(id).toBe("media-vid");
    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toContain("/media/from-url");
    const body = JSON.parse(init.body as string);
    expect(body.media[0].url).toContain("v.mp4");
  });

  it("extractMediaIdFromJobPayload يغطي الأشكال المحتملة ويعيد null عند الغياب", () => {
    expect(
      extractMediaIdFromJobPayload({ result: { payload: { media: [{ id: "a" }] } } }),
    ).toBe("a");
    expect(extractMediaIdFromJobPayload({ payload: { ids: ["b"] } })).toBe("b");
    expect(extractMediaIdFromJobPayload({ payload: { id: 7 } })).toBe("7");
    expect(extractMediaIdFromJobPayload({ payload: { failures: {} } })).toBeNull();
  });

  it("حل رابط المنشور: post_link يُحوَّل لمعرف التغريدة والفشل يعيد null بلا رمي", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse(200, {
        posts: [
          { id: "p1", text: "خبر آخر", post_link: "https://x.com/sabqorg/status/1" },
          {
            id: "p2",
            text: "خبر عاجل من سبق",
            url: "https://sabq.org/article/jrdic6y",
            post_link: "https://twitter.com/sabqorg/status/2104791827802911159?s=20",
          },
        ],
      }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const hit = await resolvePublishedPostLink("acc-1", "خبر عاجل من سبق");
    expect(hit).toEqual({
      tweetId: "2104791827802911159",
      handle: "sabqorg",
      statusUrl: "https://x.com/sabqorg/status/2104791827802911159",
    });
    expect(String(fetchMock.mock.calls[0][0])).toContain("page=0");
    expect(String(fetchMock.mock.calls[0][0])).not.toContain("query=");
    expect(fetchMock).toHaveBeenCalledTimes(1);

    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("boom")));
    expect(await resolvePublishedPostLink("acc-1", "أي نص")).toBeNull();
  });

  it("رابط الخبر في url وpost_link الفارغ لا يُعاملان كتغريدة، واسم العرض لا يُقبل", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        jsonResponse(200, {
          posts: [
            {
              id: "publer-row",
              text: "خبر عاجل من سبق",
              url: "https://sabq.org/article/jrdic6y",
              post_link: "https://x.com/صحيفة سبق الإلكترونية",
            },
          ],
        }),
      ),
    );
    expect(await resolvePublishedPostLink("acc-1", "خبر عاجل من سبق")).toBeNull();
    expect(parseXStatusUrl("https://x.com/صحيفة سبق الإلكترونية")).toBeNull();
    expect(xProfileUrlFromHandle("صحيفة سبق الإلكترونية")).toBeNull();
    expect(xProfileUrlFromHandle("@sabqorg")).toBe("https://x.com/sabqorg");
  });

  it("بحث بلا post_link يتبعه جلب الصفحة غير المفلترة التي تحمل رابط الحالة", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        jsonResponse(200, {
          posts: [{ text: "خبر عاجل من سبق", url: "https://sabq.org/article/jrdic6y" }],
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse(200, {
          posts: [{
            text: "خبر عاجل من سبق",
            post_link: "https://x.com/sabqorg/status/2104791827802911159",
          }],
        }),
      );
    vi.stubGlobal("fetch", fetchMock);
    const hit = await resolvePublishedPostLink("acc-1", "خبر عاجل من سبق", { search: true });
    expect(hit?.tweetId).toBe("2104791827802911159");
    expect(String(fetchMock.mock.calls[0][0])).toContain("query=");
    expect(String(fetchMock.mock.calls[1][0])).not.toContain("query=");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});

describe("publerApiClient — رابط الحالة لا يُبنى من اسم العرض", () => {
  beforeEach(() => {
    vi.stubEnv("PUBLER_API_KEY", "test-key");
    vi.stubEnv("PUBLER_WORKSPACE_ID", "ws-1");
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("حمولة job_status بلا post_link لا تُنتج رابطاً، واسم العرض يبقى null", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse(200, {
        posts: [{ id: "p1", text: "خبر عاجل من سبق", url: "https://sabq.org/article/jrdic6y", post_link: null }],
      }),
    );
    vi.stubGlobal("fetch", fetchMock);
    expect(findXStatusInJobPayload({ status: "complete", result: { payload: { failures: {} } } })).toBeNull();

    const pending = await resolveExternalRefAfterPublerJob({
      jobId: "6abb3fc20d073712d4416efc",
      job: { status: "complete", result: { payload: { failures: {} } } },
      publerAccountId: "acc-1",
      text: "خبر عاجل من سبق",
      handle: "صحيفة سبق الإلكترونية",
      poll: { attempts: 1, intervalMs: 0 },
    });
    expect(pending.externalPostId).toBe("publer:6abb3fc20d073712d4416efc");
    expect(pending.externalPostUrl).toBeNull();
    expect(JSON.stringify(pending)).not.toContain("صحيفة");

    const profile = buildPublerExternalRef({
      jobId: "job-1",
      handle: "sabqorg",
      resolved: null,
    });
    expect(profile).toEqual({
      externalPostId: "publer:job-1",
      externalPostUrl: "https://x.com/sabqorg",
    });
  });

  it("يستطلع GET /posts حتى يظهر post_link ثم يحفظ معرف التغريدة لا معرف Publer", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        jsonResponse(200, {
          posts: [{
            text: "خبر عاجل من سبق\nhttps://sabq.org/article/jrdic6y",
            post_link: null,
            url: "https://sabq.org/article/jrdic6y",
          }],
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse(200, {
          posts: [{
            id: "publer-post",
            text: "خبر عاجل من سبق\nhttps://sabq.org/article/jrdic6y",
            post_link: "https://x.com/sabqorg/status/2104791827802911159",
          }],
        }),
      );
    vi.stubGlobal("fetch", fetchMock);
    const result = await resolveExternalRefAfterPublerJob({
      jobId: "6abb3fc20d073712d4416efc",
      job: { status: "complete", result: { payload: { failures: {} } } },
      publerAccountId: "acc-1",
      text: "خبر عاجل من سبق\nhttps://sabq.org/article/jrdic6y",
      handle: "صحيفة سبق الإلكترونية",
      poll: { attempts: 2, intervalMs: 0 },
    });
    expect(result).toEqual({
      externalPostId: "2104791827802911159",
      externalPostUrl: "https://x.com/sabqorg/status/2104791827802911159",
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("إن أعادت الحمولة post_link نستخدمه بلا نداء لقائمة المنشورات", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const result = await resolveExternalRefAfterPublerJob({
      jobId: "job-9",
      job: {
        status: "complete",
        result: { payload: { post_link: "https://twitter.com/sabqorg/status/99" } },
      },
      publerAccountId: "acc-1",
      text: "نص",
      handle: "sabqorg",
      poll: { attempts: 3, intervalMs: 0 },
    });
    expect(result.externalPostId).toBe("99");
    expect(result.externalPostUrl).toBe("https://x.com/sabqorg/status/99");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("needsPublerStatusBackfill للمنشور المعلّق فقط، بما فيه بعد الجدولة حين يُنشر", () => {
    expect(needsPublerStatusBackfill({
      status: "published",
      externalPostId: "publer:6abb3fc20d073712d4416efc",
      externalPostUrl: "https://x.com/صحيفة سبق الإلكترونية",
    })).toBe(true);
    expect(needsPublerStatusBackfill({
      status: "published",
      externalPostId: "publer:job",
      externalPostUrl: "https://x.com/sabqorg",
    })).toBe(true);
    expect(needsPublerStatusBackfill({
      status: "published",
      externalPostId: "publer:job",
      externalPostUrl: "https://x.com/sabqorg/status/2104791827802911159",
    })).toBe(false);
    expect(needsPublerStatusBackfill({
      status: "scheduled",
      externalPostId: "publer:job",
      externalPostUrl: null,
    })).toBe(false);
    expect(needsPublerStatusBackfill({
      status: "published",
      externalPostId: "2104791827802911159",
      externalPostUrl: "https://x.com/sabqorg/status/2104791827802911159",
    })).toBe(false);
  });
});
