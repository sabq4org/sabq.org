import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  existing: [] as Array<Record<string, unknown>>,
  writes: [] as Array<Record<string, unknown>>,
}));

vi.mock("../../server/db", () => ({
  db: {
    select: () => ({ from: () => ({ where: () => ({ limit: async () => state.existing }) }) }),
    insert: () => ({
      values: (row: Record<string, unknown>) => ({
        onConflictDoUpdate: async () => {
          state.writes.push(row);
        },
      }),
    }),
  },
}));

const upload = vi.hoisted(() => vi.fn());
vi.mock("../../server/services/newsImageStorageService", () => ({
  newsImageStorageService: { upload },
}));

import {
  isImageRelocationEnabled,
  parseCloudflareImageUrl,
  relocateCloudflareImageToR2,
  relocatedLiteUrl,
  shouldRetryFailedRelocation,
} from "../../server/services/imageRelocationService";

const OLD = "https://imagedelivery.net/AbCdEf123456/1d986c4a-2c92-465e-4734-6ad594251c00/public";
const NEW = "https://media.sabq.org/news/2026/11/11111111-2222-3333-4444-555555555555/w1600.webp";
const THUMB = "https://media.sabq.org/news/2026/11/11111111-2222-3333-4444-555555555555/w480.webp";

function imageResponse(type = "image/jpeg", bytes = 10): Response {
  return new Response(new Uint8Array(bytes), { status: 200, headers: { "content-type": type } });
}

describe("parseCloudflareImageUrl", () => {
  it("maps every variant of one image to the same canonical /public key", () => {
    const flexible = parseCloudflareImageUrl(OLD.replace("/public", "/w=1080,quality=70,format=webp,fit=cover"));
    expect(flexible?.canonicalUrl).toBe(OLD);
    expect(flexible?.imageId).toBe("1d986c4a-2c92-465e-4734-6ad594251c00");
    expect(parseCloudflareImageUrl(OLD)?.prefix).toBe(OLD.replace(/public$/, ""));
  });

  it("rejects anything that is not an imagedelivery.net image URL", () => {
    expect(parseCloudflareImageUrl(NEW)).toBeNull();
    expect(parseCloudflareImageUrl("https://imagedelivery.net.evil.example/a/b/public")).toBeNull();
    expect(parseCloudflareImageUrl("https://imagedelivery.net/onlyhash")).toBeNull();
    expect(parseCloudflareImageUrl(null)).toBeNull();
  });
});

describe("relocatedLiteUrl", () => {
  const ref = parseCloudflareImageUrl(OLD)!;
  it("moves the lite URL only when it points at the relocated image", () => {
    expect(relocatedLiteUrl(`${ref.prefix}w=1080,quality=70,format=webp,fit=cover`, ref, NEW)).toBe(NEW);
    const other = "https://imagedelivery.net/AbCdEf123456/another-image-id/public";
    expect(relocatedLiteUrl(other, ref, NEW)).toBe(other);
    expect(relocatedLiteUrl(null, ref, NEW)).toBeNull();
  });
});

describe("switches and retry window", () => {
  it("is on by default and off only by explicit flag", () => {
    expect(isImageRelocationEnabled({})).toBe(true);
    expect(isImageRelocationEnabled({ CF_IMAGE_RELOCATION: "off" })).toBe(false);
    expect(isImageRelocationEnabled({ CF_IMAGE_RELOCATION: "on" })).toBe(true);
  });

  it("retries a failed image only after six hours", () => {
    const now = new Date("2026-11-11T12:00:00Z");
    expect(shouldRetryFailedRelocation(new Date("2026-11-11T07:00:00Z"), now)).toBe(false);
    expect(shouldRetryFailedRelocation(new Date("2026-11-11T05:59:00Z"), now)).toBe(true);
    expect(shouldRetryFailedRelocation(null, now)).toBe(true);
  });
});

describe("relocateCloudflareImageToR2", () => {
  const ref = parseCloudflareImageUrl(OLD)!;
  const fetchMock = vi.fn();

  beforeEach(() => {
    state.existing = [];
    state.writes = [];
    upload.mockReset();
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
  });
  afterEach(() => vi.unstubAllGlobals());

  it("copies once to R2 only (no Cloudflare Images fallback) and records the mapping", async () => {
    fetchMock.mockResolvedValue(imageResponse());
    upload.mockResolvedValue({ success: true, deliveryUrl: NEW, thumbnailUrl: THUMB });

    const result = await relocateCloudflareImageToR2(ref);

    expect(result).toEqual({ ok: true, newUrl: NEW });
    expect(fetchMock.mock.calls[0][0]).toBe(OLD);
    expect(upload.mock.calls[0][0]).toMatchObject({ forceR2: true, purpose: "article-relocated", mimeType: "image/jpeg" });
    expect(state.writes[0]).toMatchObject({ oldUrl: OLD, newUrl: NEW, status: "completed" });
  });

  it("returns the recorded URL without downloading again", async () => {
    state.existing = [{ status: "completed", newUrl: NEW }];
    const result = await relocateCloudflareImageToR2(ref);
    expect(result).toEqual({ ok: true, newUrl: NEW, reused: true });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(upload).not.toHaveBeenCalled();
  });

  it("stores the small variant for queue rows that ask for it", async () => {
    state.existing = [{ status: "pending_thumb", newUrl: null }];
    fetchMock.mockResolvedValue(imageResponse());
    upload.mockResolvedValue({ success: true, deliveryUrl: NEW, thumbnailUrl: THUMB });
    expect((await relocateCloudflareImageToR2(ref)).newUrl).toBe(THUMB);
  });

  it("records a failure and keeps the old URL when the source is not an image", async () => {
    fetchMock.mockResolvedValue(imageResponse("text/html"));
    const result = await relocateCloudflareImageToR2(ref);
    expect(result.ok).toBe(false);
    expect(upload).not.toHaveBeenCalled();
    expect(state.writes[0]).toMatchObject({ oldUrl: OLD, status: "failed" });
    expect(state.writes[0].newUrl).toBeUndefined();
  });

  it("records a failure when R2 refuses the upload", async () => {
    fetchMock.mockResolvedValue(imageResponse());
    upload.mockResolvedValue({ success: false, error: "R2 upload failed (timeout)" });
    const result = await relocateCloudflareImageToR2(ref);
    expect(result).toEqual({ ok: false, error: "R2 upload failed (timeout)" });
    expect(state.writes[0]).toMatchObject({ status: "failed" });
  });

  it("does not hammer an image that failed less than six hours ago", async () => {
    const now = new Date("2026-11-11T12:00:00Z");
    state.existing = [{ status: "failed", error: "source responded 404", completedAt: new Date("2026-11-11T11:00:00Z") }];
    const result = await relocateCloudflareImageToR2(ref, { now });
    expect(result.ok).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
