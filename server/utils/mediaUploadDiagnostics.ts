import type { NextFunction, Request, Response } from "express";
import { randomUUID } from "crypto";

export type MediaUploadProbe = {
  requestId: string;
  startedAt: number;
  bodyReceivedAt?: number;
  stage: "auth" | "rate-limit" | "body-receive" | "parse" | "verify" | "provider" | "storage" | "database" | "hash";
};

export function mediaUploadRequestId(req: Request): string {
  const supplied = String(req.headers["x-request-id"] || "").trim();
  return /^[A-Za-z0-9._:-]{1,128}$/.test(supplied) ? supplied : randomUUID();
}

/** Request lifecycle telemetry for upload transport diagnostics only. */
export const mediaUploadProbe = (req: Request, res: Response, next: NextFunction) => {
  const probe: MediaUploadProbe = {
    requestId: mediaUploadRequestId(req),
    startedAt: Date.now(),
    stage: "body-receive",
  };
  (req as any).__mediaUploadProbe = probe;
  res.setHeader("X-Request-ID", probe.requestId);

  req.on("end", () => {
    probe.bodyReceivedAt = Date.now();
    probe.stage = "parse";
  });
  req.on("aborted", () => {
    console.warn(
      `[Media Upload] lifecycle requestId=${probe.requestId} stage=${probe.stage} event=request-aborted elapsed=${Date.now() - probe.startedAt}ms`,
    );
  });
  res.on("finish", () => {
    console.log(
      `[Media Upload] lifecycle requestId=${probe.requestId} stage=response status=${res.statusCode} elapsed=${Date.now() - probe.startedAt}ms body=${probe.bodyReceivedAt ? `${probe.bodyReceivedAt - probe.startedAt}ms` : "pending"}`,
    );
  });
  res.on("close", () => {
    if (res.writableEnded) return;
    console.warn(
      `[Media Upload] lifecycle requestId=${probe.requestId} stage=${probe.stage} event=client-closed elapsed=${Date.now() - probe.startedAt}ms body=${probe.bodyReceivedAt ? `${probe.bodyReceivedAt - probe.startedAt}ms` : "pending"}`,
    );
  });
  next();
};

export const markMediaUploadStage = (stage: MediaUploadProbe["stage"]) =>
  (req: Request, _res: Response, next: NextFunction) => {
    const probe = (req as any).__mediaUploadProbe as MediaUploadProbe | undefined;
    if (probe) probe.stage = stage;
    next();
  };
