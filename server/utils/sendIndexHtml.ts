import type { Response } from "express";
import fs from "fs";

export function setNoBrowserCacheHeaders(res: Response): void {
  res.removeHeader("Cache-Control");
  res.removeHeader("cache-control");
  res.removeHeader("Pragma");
  res.removeHeader("Expires");
  res.removeHeader("CDN-Cache-Control");
  res.removeHeader("cdn-cache-control");
  res.setHeader("Cache-Control", "private, no-store");
  res.setHeader("CDN-Cache-Control", "no-store");
  res.setHeader("Pragma", "no-cache");
  res.setHeader("Expires", "0");
}

export function sendIndexHtml(
  res: Response,
  indexPath: string,
  statusCode = 200
): void {
  setNoBrowserCacheHeaders(res);
  res.status(statusCode).type("text/html; charset=utf-8");
  try {
    const html = fs.readFileSync(indexPath, "utf-8");
    res.send(html);
  } catch (err) {
    res.status(500).type("text/plain").send("Error loading page");
  }
}
