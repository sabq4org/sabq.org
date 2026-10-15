/**
 * عميل HTTP للبنك المركزي السعودي (ساما).
 *
 * فخّان موثّقان من فحص 2026-08-28:
 * - ساما تُسقط اتصالات IPv6 فورًا (Connection reset) → نُجبر `family: 4`.
 * - نقاط JSON الحية (PortalHandler.ashx) غير موثّقة رسميًا؛ هي ما تستدعيه صفحة ساما
 *   نفسها. لذلك كل طلب يمرّ بمهلة قصيرة وبلا إعادة محاولة عمياء، والمستهلكون
 *   يتحققون من شكل الاستجابة ويجمّدون آخر قيمة سليمة عند أي اختلاف.
 *
 * لا يستورد db (ADR-001).
 */
import https from "node:https";
import { URL } from "node:url";

export const SAMA_ORIGIN = "https://www.sama.gov.sa";
export const SAMA_PORTAL_HANDLER = "/ar-sa/_LAYOUTS/15/SAMA.Portal/PortalHandler.ashx";

const USER_AGENT =
  process.env.SAMA_HTTP_USER_AGENT ||
  "Mozilla/5.0 (compatible; SabqEconomyBot/1.0; +https://sabq.org)";

function envMs(name: string, fallback: number): number {
  const raw = Number(process.env[name]);
  return Number.isFinite(raw) && raw > 0 ? raw : fallback;
}

export function isSamaEnabled(): boolean {
  return process.env.SAMA_ENABLED !== "false";
}

export class SamaHttpError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly url: string,
  ) {
    super(message);
    this.name = "SamaHttpError";
  }
}

interface RawResponse {
  status: number;
  headers: Record<string, string | string[] | undefined>;
  body: Buffer;
}

function requestOnce(url: string, accept: string, timeoutMs: number): Promise<RawResponse> {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const req = https.request(
      {
        method: "GET",
        hostname: u.hostname,
        path: u.pathname + u.search,
        family: 4, // ساما تقطع IPv6
        headers: {
          "User-Agent": USER_AGENT,
          Accept: accept,
          "Accept-Language": "ar,en;q=0.8",
        },
        timeout: timeoutMs,
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on("data", (c: Buffer) => chunks.push(c));
        res.on("end", () =>
          resolve({ status: res.statusCode ?? 0, headers: res.headers, body: Buffer.concat(chunks) }),
        );
        res.on("error", reject);
      },
    );
    req.on("timeout", () => req.destroy(new Error(`SAMA request timed out after ${timeoutMs}ms`)));
    req.on("error", reject);
    req.end();
  });
}

/** GET مع متابعة حتى 3 تحويلات (ساما تحوّل أحيانًا بين ar-sa/en-US ومسارات _layouts). */
export async function samaGet(
  pathOrUrl: string,
  opts: { accept?: string; timeoutMs?: number } = {},
): Promise<RawResponse> {
  const timeoutMs = opts.timeoutMs ?? envMs("SAMA_HTTP_TIMEOUT_MS", 15_000);
  const accept = opts.accept ?? "application/json, text/html;q=0.9, */*;q=0.5";
  let url = pathOrUrl.startsWith("http") ? pathOrUrl : SAMA_ORIGIN + pathOrUrl;
  for (let hop = 0; hop < 4; hop++) {
    const res = await requestOnce(url, accept, timeoutMs);
    if (res.status >= 300 && res.status < 400) {
      const loc = res.headers.location;
      const next = Array.isArray(loc) ? loc[0] : loc;
      if (!next) throw new SamaHttpError(`redirect without location`, res.status, url);
      url = next.startsWith("http") ? next : SAMA_ORIGIN + next;
      continue;
    }
    if (res.status < 200 || res.status >= 300) {
      throw new SamaHttpError(`SAMA responded ${res.status}`, res.status, url);
    }
    return res;
  }
  throw new SamaHttpError("too many redirects", 310, url);
}

export async function samaGetJson<T>(pathOrUrl: string): Promise<T> {
  const res = await samaGet(pathOrUrl, { accept: "application/json" });
  const text = res.body.toString("utf8").replace(/^﻿/, "");
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new SamaHttpError(`SAMA returned non-JSON (${text.slice(0, 80)}…)`, res.status, pathOrUrl);
  }
}

export async function samaGetText(pathOrUrl: string): Promise<string> {
  const res = await samaGet(pathOrUrl, { accept: "text/html,*/*" });
  return res.body.toString("utf8");
}

export async function samaGetBuffer(pathOrUrl: string): Promise<Buffer> {
  const res = await samaGet(pathOrUrl, {
    accept: "application/pdf,application/octet-stream,*/*",
    timeoutMs: envMs("SAMA_FILE_TIMEOUT_MS", 30_000),
  });
  return res.body;
}

/** يبني رابط PortalHandler مع ترميز آمن للمعاملات. */
export function portalHandlerUrl(params: Record<string, string | number | boolean>): string {
  const q = Object.entries(params)
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`)
    .join("&");
  return `${SAMA_PORTAL_HANDLER}?${q}`;
}

/** تواريخ ساما تأتي بصيغ dd-MM-yyyy أو dd/MM/yyyy أو ISO — نوحّدها إلى ISO (UTC منتصف الليل). */
export function parseSamaDate(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const s = String(raw).trim();
  const dmy = s.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})/);
  if (dmy) {
    const [, d, m, y] = dmy;
    return `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
  }
  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  return null;
}

/** "4.25%" → 4.25 ؛ "1,234.5" → 1234.5 ؛ غير الرقمي → null. */
export function parseSamaNumber(raw: unknown): number | null {
  if (typeof raw === "number") return Number.isFinite(raw) ? raw : null;
  if (typeof raw !== "string") return null;
  const cleaned = raw.replace(/[%,\s]/g, "").replace(/[٠-٩]/g, (d) => String("٠١٢٣٤٥٦٧٨٩".indexOf(d)));
  if (!cleaned || cleaned === "-") return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}
