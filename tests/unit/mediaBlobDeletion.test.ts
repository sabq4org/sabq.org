import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  queue: [] as unknown[][],
  r2Deletes: [] as string[],
  cfDeletes: [] as string[],
}));

vi.mock("../../server/db", () => {
  const chain = () => {
    const rows = state.queue.shift() ?? [];
    const c: any = { from: () => c, where: () => c, limit: async () => rows };
    return c;
  };
  return { db: { select: () => chain() } };
});
vi.mock("../../server/services/newsImageStorageService", () => ({
  newsImageStorageService: {
    deleteByPublicUrl: async (url: string) => {
      if (!url.includes("media.sabq.org/news/")) return false;
      state.r2Deletes.push(url);
      return true;
    },
  },
}));
vi.mock("../../server/services/cloudflareImagesService", () => ({
  cloudflareImagesService: {
    extractImageId: (url: string) => url.match(/imagedelivery\.net\/[^/]+\/([^/]+)\//)?.[1] ?? null,
    deleteImage: async (id: string) => {
      state.cfDeletes.push(id);
      return true;
    },
  },
}));

import { deleteMediaBlobIfUnshared, mediaBlobIdentity } from "../../server/services/mediaStorage";

const R2 = "https://media.sabq.org/news/2026/10/0b4c7f2a-1111-2222-3333-444455556666/w800.webp";

beforeEach(() => {
  state.queue.length = 0;
  state.r2Deletes.length = 0;
  state.cfDeletes.length = 0;
});

describe("mediaBlobIdentity", () => {
  it("maps every variant and query of one stored image to the same identity", () => {
    const id = mediaBlobIdentity(R2);
    expect(id).toBe("/news/2026/10/0b4c7f2a-1111-2222-3333-444455556666/");
    expect(mediaBlobIdentity(R2.replace("w800", "w320") + "?x=1")).toBe(id);
    expect(mediaBlobIdentity("https://imagedelivery.net/hash/abc-123/public")).toBe("imagedelivery.net/%/abc-123/");
  });
});

describe("deleteMediaBlobIfUnshared", () => {
  it("keeps the owner's file when another account deletes its alias row (?x=1)", async () => {
    state.queue.push([{ id: "owner-row" }]);
    await deleteMediaBlobIfUnshared({ id: "attacker-row", url: R2 + "?x=1" });
    expect(state.r2Deletes).toEqual([]);
  });

  it("keeps the file when another media row still points at it", async () => {
    state.queue.push([{ id: "owner-row" }]);
    await deleteMediaBlobIfUnshared({ id: "my-row", url: R2 });
    expect(state.r2Deletes).toEqual([]);
  });

  it("keeps the file when an article still uses it", async () => {
    state.queue.push([], [{ id: "article-1" }]);
    await deleteMediaBlobIfUnshared({ id: "my-row", url: "https://imagedelivery.net/hash/abc-123/public" });
    expect(state.cfDeletes).toEqual([]);
  });

  it("deletes the owner's own unshared upload", async () => {
    state.queue.push([], []);
    await deleteMediaBlobIfUnshared({ id: "my-row", url: R2 });
    expect(state.r2Deletes).toEqual([R2]);
  });
});
