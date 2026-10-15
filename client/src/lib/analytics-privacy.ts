/** Small, dependency-free privacy boundary shared by GA4 event helpers and boot scripts. */

const SENSITIVE_KEY = /(?:^|[_-])(?:token|auth|pass(?:word)?|secret|session|sid|jwt|code|otp|verification|verify|reset|credential|email|phone|mobile|tel|address|user[_-]?id)(?:$|[_-])/i;
const EMAIL_VALUE = /[^\s@]+@[^\s@]+\.[^\s@]+/i;

const SENSITIVE_PATH = /\/(?:login|register|signup|sign-up|auth|reset-password|forgot-password|set-password|2fa-verify|verify-email|complete-name|onboarding|account|newsletter)(?:\/|$)/i;
const LOCAL_HOST = /^(?:localhost|127(?:\.\d{1,3}){3}|0\.0\.0\.0|::1|\[::1\])$/i;

declare global {
  interface Window {
    __sabqAnalyticsAllowed?: () => boolean;
    __sabqSanitizeAnalyticsUrl?: (input: string) => string;
  }
}

function sensitiveKey(key: string): boolean {
  const normalized = key.replace(/([a-z0-9])([A-Z])/g, "$1_$2").toLowerCase();
  return SENSITIVE_KEY.test(normalized);
}

function asUrl(input: string): URL | null {
  try {
    return new URL(input, "https://sabq.org");
  } catch {
    return null;
  }
}

function sensitiveValue(value: string): boolean {
  const trimmed = value.trim();
  if (/^\d{4}[-/.]\d{1,2}[-/.]\d{1,4}$/.test(trimmed)) return false;
  let decoded = value;
  for (let i = 0; i < 2; i += 1) {
    try {
      const next = decodeURIComponent(decoded);
      if (next === decoded) break;
      decoded = next;
    } catch {
      break;
    }
  }
  // Free text (not just a whole parameter) can contain contact details.
  const latinDigits = decoded.replace(/[٠-٩]/g, digit => String(digit.charCodeAt(0) - 0x660));
  const phone = [...latinDigits.matchAll(/(?:^|[^\d])((?:\+?\d)[\d ().-]{6,}\d)(?=$|[^\d])/g)]
    .some(match => { const digits = match[1].replace(/\D/g, ""); return digits.length >= 8 && digits.length <= 15; });
  return EMAIL_VALUE.test(decoded) || phone;
}

/**
 * Keeps the origin/path and analytics-safe query keys (including UTM keys),
 * dropping credentials, tokens, contact data, and values that look like them.
 */
export function sanitizeAnalyticsUrl(input: string): string {
  if (!input.trim()) return "";
  const url = asUrl(input);
  if (!url) return "https://sabq.org/";

  if (url.protocol !== "https:" && url.protocol !== "http:") return "";
  const safePath = url.pathname.split("/").map(segment => {
    let decoded = segment;
    try { decoded = decodeURIComponent(decodeURIComponent(segment)); } catch { /* partial encoding */ }
    return EMAIL_VALUE.test(decoded) || /^(?:\+966|05|٠٥|\+٩٦٦)/.test(decoded) && sensitiveValue(decoded) ? "[redacted]" : segment;
  }).join("/");
  const safe = new URL(url.origin + safePath);
  for (const [key, value] of url.searchParams) {
    const normalizedKey = key.toLowerCase();
    const queryAllowed = normalizedKey === "q" || normalizedKey === "page" ||
      ["gclid", "dclid", "wbraid", "gbraid"].includes(normalizedKey) || normalizedKey.startsWith("utm_");
    if (!queryAllowed || sensitiveKey(key) || sensitiveValue(value)) continue;
    safe.searchParams.append(key, value);
  }
  return safe.toString();
}

/** Public production web only. Sensitive routes are deliberately silent. */
export function isAnalyticsAllowed(): boolean {
  if (typeof window === "undefined" || !window.location) return false;
  const { hostname, pathname } = window.location;
  if (LOCAL_HOST.test(hostname) || hostname.endsWith(".pages.dev")) return false;
  if (!(hostname === "sabq.org" || hostname === "www.sabq.org")) return false;
  if (/^\/(?:admin|dashboard|en\/dashboard|ur\/dashboard|settings|en\/settings|ur\/settings|payment|onboarding|survey|meet)(?:\/|$)/i.test(pathname)) return false;
  if (/^\/(?:profile|notifications|bookmarks|reading-history|my-follows|my-keywords|my-votes|notification-settings|recommendation-settings|preferences|loyalty|en\/profile|en\/notification-settings|ur\/profile)(?:\/|$)/i.test(pathname)) return false;
  if (/^\/(?:verify|advertise\/(?:dashboard|create|payment)|muqtarab\/submit)(?:\/|$)/i.test(pathname)) return false;
  if (SENSITIVE_PATH.test(pathname)) return false;
  return true;
}

let analyticsInitialized = false;
let analyticsContext: Record<string, unknown> = {};

function pushGtagCommand(..._command: unknown[]) {
  // gtag's documented queue uses an Arguments object, not an event object.
  window.dataLayer.push(arguments);
}

/** Initialize GA4 once, reevaluating the current SPA route on every call. */
export function ensureAnalyticsReady(): boolean {
  if (typeof window === "undefined") return false;
  const allowed = isAnalyticsAllowed();
  window.__sabqAnalyticsAllowed = isAnalyticsAllowed;
  window.__sabqSanitizeAnalyticsUrl = sanitizeAnalyticsUrl;
  if (!allowed) return false;
  if (analyticsInitialized) return true;

  window.dataLayer = window.dataLayer || [];
  window.gtag = (...args: unknown[]) => {
    if (!isAnalyticsAllowed()) return;
    const [command, name, third] = args;
    if (command === "set") {
      const raw = typeof name === "object" && name !== null ? name : { [String(name)]: third };
      const safe = sanitizeAnalyticsParams(raw as Record<string, unknown>);
      analyticsContext = { ...analyticsContext, ...safe };
      pushGtagCommand("set", safe);
    } else if (command === "event" || command === "config") {
      const explicitLocation = third && typeof third === "object" && "page_location" in third ? third.page_location : undefined;
      const location = sanitizeAnalyticsUrl(typeof explicitLocation === "string" ? explicitLocation : window.location.href);
      const defaults = {
        ...analyticsContext,
        page_title: document.title || "سبق",
        page_location: location,
        page_referrer: analyticsContext.page_location === location
          ? analyticsContext.page_referrer ?? sanitizeAnalyticsUrl(document.referrer || "")
          : analyticsContext.page_location ?? sanitizeAnalyticsUrl(document.referrer || ""),
      };
      const safe = sanitizeAnalyticsParams({ ...defaults, ...(third && typeof third === "object" ? third : {}) });
      pushGtagCommand(command, name, safe);
    } else {
      pushGtagCommand(...args);
    }
  };
  window.gtag("js", new Date());
  window.gtag("config", "G-EEB5593GY7", { send_page_view: false, page_location: sanitizeAnalyticsUrl(window.location.href), page_title: document.title || "سبق", cookie_flags: "SameSite=None;Secure" });
  const script = document.createElement("script");
  script.async = true;
  script.src = "https://www.googletagmanager.com/gtag/js?id=G-EEB5593GY7";
  script.dataset.cfasync = "false";
  document.head.appendChild(script);
  analyticsInitialized = true;
  window.dispatchEvent(new CustomEvent("sabq:analytics-ready"));
  return true;
}

/** Snapshot for delayed reading events that belong to the page being left. */
export function getAnalyticsPageContext(): { page_title?: string; page_referrer?: string } {
  const current = typeof window !== "undefined" ? sanitizeAnalyticsUrl(window.location.href) : "";
  return {
    page_title: typeof document !== "undefined" ? document.title : undefined,
    page_referrer: analyticsContext.page_location === current
      ? String(analyticsContext.page_referrer ?? "")
      : String(analyticsContext.page_location ?? (typeof document !== "undefined" ? sanitizeAnalyticsUrl(document.referrer || "") : "")),
  };
}

/** Update GA's automatic context after a SPA route/title transition. */
export function updateAnalyticsPageContext(url: string, referrer?: string, title?: string): boolean {
  if (!ensureAnalyticsReady() || !isAnalyticsAllowed()) return false;
  const params: Record<string, unknown> = {
    page_location: sanitizeAnalyticsUrl(url),
  };
  if (referrer !== undefined) params.page_referrer = sanitizeAnalyticsUrl(referrer);
  if (title) params.page_title = title;
  window.gtag("set", params);
  return true;
}

function safeString(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed || sensitiveValue(trimmed)) return null;
  return trimmed;
}

/** Remove sensitive event fields recursively while retaining useful IDs/labels. */
export function sanitizeAnalyticsParams(
  params: Record<string, unknown>,
): Record<string, unknown> {
  const clean = (value: unknown): unknown => {
    if (typeof value === "string") return safeString(value);
    if (Array.isArray(value)) return value.map(clean).filter((item) => item != null);
    if (value && typeof value === "object") {
      const result: Record<string, unknown> = {};
      for (const [key, child] of Object.entries(value)) {
        if (sensitiveKey(key)) continue;
        const next = (key === "page_url" || key === "page_location" || key === "page_referrer" || key === "url" || key === "referrer") && typeof child === "string"
          ? sanitizeAnalyticsUrl(child)
          // Public content identifiers are not contact values. User identifiers
          // are still rejected above; never exempt arbitrary *_id fields.
          : key === "page_title" && typeof child === "string"
            ? safeString(child) ?? "[redacted]"
          : /^(?:article_id|parent_comment_id)$/.test(key) && typeof child === "string" && /^[a-zA-Z0-9-]{1,100}$/.test(child)
            ? child
            : clean(child);
        if (next != null) result[key] = next;
      }
      return result;
    }
    return value;
  };

  return clean(params) as Record<string, unknown>;
}
