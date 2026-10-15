import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  read: vi.fn(),
  compareAndSet: vi.fn(),
  resolve: vi.fn(),
  mirror: vi.fn(),
}));

vi.mock("../../server/services/sahraaTvBlockPersistence", () => ({
  readSahraaTvBlockSetting: mocks.read,
  compareAndSetSahraaTvBlockSetting: mocks.compareAndSet,
}));
vi.mock("../../server/services/sahraaTvVideoResolver", () => ({
  resolveXVideoFromPostUrl: mocks.resolve,
}));
vi.mock("../../server/services/sahraaTvMediaMirror", () => ({
  mirrorSahraaVideoToR2: mocks.mirror,
}));

import {
  getPublicSahraaTvBlock,
  saveSahraaTvBlockConfig,
} from "../../server/services/sahraaTvBlockService";
import { proxySahraaTvMedia } from "../../server/services/sahraaTvMediaProxy";
import { SAHRAA_MEDIA_PATH } from "../../server/services/sahraaTvBlockUtils";

const baseConfig = {
  isActive: true,
  title: "قناة الصحراء",
  description: "وصف اليوم",
  xPostUrl: "https://x.com/Sahraachannel/status/2082154114893361183",
  videoUrl: "https://video.twimg.com/clip.mp4",
  mirroredVideoUrl: "",
  posterUrl: "",
  updatedAt: "2026-10-01T10:00:00.000Z",
};

function snapshot(rawValue: unknown = baseConfig) {
  return { rawValue };
}

describe("Sahraa TV block persistence boundaries", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.compareAndSet.mockResolvedValue(undefined);
    mocks.mirror.mockResolvedValue(null);
  });

  it("keeps a hidden block hidden across repeated public reads", async () => {
    mocks.read.mockResolvedValue({
      ...snapshot({ ...baseConfig, isActive: false }),
    });

    await expect(getPublicSahraaTvBlock()).resolves.toEqual({ isVisible: false });
    await expect(getPublicSahraaTvBlock()).resolves.toEqual({ isVisible: false });

    expect(mocks.resolve).not.toHaveBeenCalled();
    expect(mocks.mirror).not.toHaveBeenCalled();
    expect(mocks.compareAndSet).not.toHaveBeenCalled();
  });

  it("fails closed on a database read error without resolving or writing", async () => {
    mocks.read.mockRejectedValue(new Error("database unavailable"));

    await expect(getPublicSahraaTvBlock()).resolves.toEqual({ isVisible: false });
    expect(mocks.resolve).not.toHaveBeenCalled();
    expect(mocks.mirror).not.toHaveBeenCalled();
    expect(mocks.compareAndSet).not.toHaveBeenCalled();
  });

  it("does not resolve a legacy active setting with no saved video", async () => {
    mocks.read.mockResolvedValue(snapshot({ ...baseConfig, videoUrl: "" }));

    await expect(getPublicSahraaTvBlock()).resolves.toEqual({ isVisible: false });
    expect(mocks.resolve).not.toHaveBeenCalled();
    expect(mocks.mirror).not.toHaveBeenCalled();
  });

  it("keeps media requests read-only when no saved video exists", async () => {
    mocks.read.mockResolvedValue(snapshot({ ...baseConfig, videoUrl: "" }));
    const res = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn().mockReturnThis(),
    } as any;

    await proxySahraaTvMedia({ headers: {} } as any, res);

    expect(res.status).toHaveBeenCalledWith(404);
    expect(mocks.resolve).not.toHaveBeenCalled();
    expect(mocks.mirror).not.toHaveBeenCalled();
    expect(mocks.compareAndSet).not.toHaveBeenCalled();
  });

  it("uses the same-origin proxy for a saved direct video and R2 for a mirror", async () => {
    mocks.read.mockResolvedValue(snapshot(baseConfig));
    await expect(getPublicSahraaTvBlock()).resolves.toMatchObject({
      isVisible: true,
      videoUrl: SAHRAA_MEDIA_PATH,
    });

    mocks.read.mockResolvedValue(
      snapshot({
        ...baseConfig,
        mirroredVideoUrl: "https://media.sabq.org/sahraa-tv/clip.mp4",
      }),
    );
    await expect(getPublicSahraaTvBlock()).resolves.toMatchObject({
      isVisible: true,
      videoUrl: "https://media.sabq.org/sahraa-tv/clip.mp4",
    });
    expect(mocks.resolve).not.toHaveBeenCalled();
    expect(mocks.mirror).not.toHaveBeenCalled();
  });

  it("resolves and mirrors only during an explicit successful admin save", async () => {
    const before = snapshot({ ...baseConfig, isActive: false, videoUrl: "" });
    mocks.read.mockResolvedValue(before);
    mocks.resolve.mockResolvedValue({
      videoUrl: "https://video.twimg.com/new.mp4",
      posterUrl: "https://pbs.twimg.com/new.jpg",
    });
    mocks.mirror.mockResolvedValue("https://media.sabq.org/sahraa-tv/new.mp4");

    const saved = await saveSahraaTvBlockConfig({ isActive: true });

    expect(mocks.resolve).toHaveBeenCalledOnce();
    expect(mocks.mirror).toHaveBeenCalledWith(
      "https://video.twimg.com/new.mp4",
      "2082154114893361183",
    );
    expect(mocks.compareAndSet).toHaveBeenCalledOnce();
    expect(mocks.compareAndSet).toHaveBeenCalledWith(
      before,
      expect.objectContaining({
        isActive: true,
        videoUrl: "https://video.twimg.com/new.mp4",
        posterUrl: "https://pbs.twimg.com/new.jpg",
        mirroredVideoUrl: "https://media.sabq.org/sahraa-tv/new.mp4",
      }),
    );
    expect(saved.mirroredVideoUrl).toBe("https://media.sabq.org/sahraa-tv/new.mp4");
  });

  it("cannot overwrite a hide saved while resolver work is in flight", async () => {
    const before = snapshot({ ...baseConfig, isActive: false, videoUrl: "" });
    let releaseResolver!: (value: { videoUrl: string; posterUrl: string }) => void;
    mocks.read.mockResolvedValue(before);
    mocks.resolve.mockReturnValue(
      new Promise((resolve) => {
        releaseResolver = resolve;
      }),
    );
    mocks.compareAndSet.mockRejectedValue(new Error("SAHRAA_TV_BLOCK_WRITE_CONFLICT"));

    const pending = saveSahraaTvBlockConfig({ isActive: true });
    expect(mocks.compareAndSet).not.toHaveBeenCalled();
    releaseResolver({
      videoUrl: "https://video.twimg.com/new.mp4",
      posterUrl: "",
    });

    await expect(pending).rejects.toThrow("SAHRAA_TV_BLOCK_WRITE_CONFLICT");
    expect(mocks.compareAndSet).toHaveBeenCalledOnce();
  });

  it("reports a concurrent first insert instead of replacing it", async () => {
    mocks.read.mockResolvedValue(null);
    mocks.resolve.mockResolvedValue({
      videoUrl: "https://video.twimg.com/new.mp4",
      posterUrl: "",
    });
    mocks.compareAndSet.mockRejectedValue(new Error("SAHRAA_TV_BLOCK_WRITE_CONFLICT"));

    await expect(saveSahraaTvBlockConfig({ isActive: true })).rejects.toThrow(
      "SAHRAA_TV_BLOCK_WRITE_CONFLICT",
    );
    expect(mocks.compareAndSet).toHaveBeenCalledWith(null, expect.any(Object));
  });
});
