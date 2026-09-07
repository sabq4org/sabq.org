import { EventEmitter } from "node:events";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  markMediaUploadStage,
  mediaUploadProbe,
} from "../../server/utils/mediaUploadDiagnostics";

function surfaces(requestId: string) {
  const req = Object.assign(new EventEmitter(), { headers: { "x-request-id": requestId } });
  const res = Object.assign(new EventEmitter(), {
    statusCode: 200,
    writableEnded: false,
    setHeader: vi.fn(),
  });
  return { req, res };
}

describe("media upload diagnostics", () => {
  afterEach(() => vi.restoreAllMocks());

  it("replaces a malformed correlation id and never logs its contents", () => {
    const { req, res } = surfaces("upload\nsecret-token");
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    mediaUploadProbe(req as any, res as any, () => {});

    const id = (req as any).__mediaUploadProbe.requestId;
    expect(id).toMatch(/^[0-9a-f-]{36}$/);
    expect(id).not.toContain("secret-token");
    expect(warn).not.toHaveBeenCalled();
  });

  it("keeps a provider-stage response disconnect attributable to provider", () => {
    const { req, res } = surfaces("upload-123");
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    mediaUploadProbe(req as any, res as any, () => {});
    markMediaUploadStage("provider")(req as any, res as any, () => {});

    res.emit("close");

    expect(warn).toHaveBeenCalledWith(expect.stringContaining("stage=provider"));
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("requestId=upload-123"));
  });

  it("records body completion separately from the handler phase", () => {
    const { req, res } = surfaces("upload-456");
    mediaUploadProbe(req as any, res as any, () => {});
    const probe = (req as any).__mediaUploadProbe;
    expect(probe.bodyReceivedAt).toBeUndefined();

    req.emit("end");

    expect(probe.bodyReceivedAt).toEqual(expect.any(Number));
    expect(probe.stage).toBe("parse");
  });
});
