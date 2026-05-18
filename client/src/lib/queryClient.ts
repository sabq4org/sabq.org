import { QueryClient, QueryFunction } from "@tanstack/react-query";
import { toast } from "@/hooks/use-toast";

// API base URL.
//
//   - If VITE_API_URL is set (e.g. "https://api.sabq.org"), API calls are
//     rewritten to absolute URLs targeting that origin. Use this when the
//     frontend (Vercel) and backend (Railway) are on separate origins AND
//     you want to skip the Vercel rewrite proxy.
//   - If VITE_API_URL is empty (default on Vercel with rewrites configured
//     in vercel.json, or on Replit single-origin), API calls stay relative
//     and are proxied/served by the same origin.
//
// `apiUrl()` is exported so feature code making raw fetch() calls can opt in
// without depending on apiRequest().
const API_BASE = (import.meta.env.VITE_API_URL || "").replace(/\/+$/, "");

export function apiUrl(path: string): string {
  if (!API_BASE) return path;
  if (/^https?:\/\//i.test(path)) return path;
  if (path.startsWith("/api/") || path === "/api" || path.startsWith("/health") || path.startsWith("/ready")) {
    return API_BASE + path;
  }
  return path;
}

function getCsrfTokenFromCookie(): string | null {
  const match = document.cookie.match(/csrf-token=([^;]+)/);
  return match ? match[1] : null;
}

let csrfToken: string | null = null;
let csrfInitPromise: Promise<void> | null = null;
let csrfRetryCount = 0;
const MAX_CSRF_RETRIES = 3;

async function fetchCsrfToken(): Promise<void> {
  if (csrfInitPromise) {
    return csrfInitPromise;
  }
  
  csrfInitPromise = (async () => {
    while (csrfRetryCount < MAX_CSRF_RETRIES) {
      try {
        const res = await fetch(apiUrl("/api/csrf-token"), { credentials: "include" });
        if (res.ok) {
          const data = await res.json();
          csrfToken = data.csrfToken;
          csrfRetryCount = 0;
          return;
        }
      } catch (e) {
        console.error("Failed to fetch CSRF token, attempt", csrfRetryCount + 1, e);
      }
      csrfRetryCount++;
      if (csrfRetryCount < MAX_CSRF_RETRIES) {
        await new Promise(resolve => setTimeout(resolve, 500 * Math.pow(2, csrfRetryCount - 1)));
      }
    }
    csrfToken = getCsrfTokenFromCookie();
  })();
  
  await csrfInitPromise;
  csrfInitPromise = null;
}

export async function ensureCsrfToken(): Promise<string | null> {
  if (!csrfToken && !getCsrfTokenFromCookie()) {
    await fetchCsrfToken();
  }
  return csrfToken || getCsrfTokenFromCookie();
}

export async function initializeCsrf(): Promise<void> {
  await fetchCsrfToken();
}

async function refreshCsrfToken(): Promise<string | null> {
  csrfToken = null;
  csrfRetryCount = 0;
  csrfInitPromise = null;
  await fetchCsrfToken();
  return csrfToken;
}

export function getCsrfToken(): string | null {
  return csrfToken || getCsrfTokenFromCookie();
}

/**
 * Soft cap below Safari's 64KB keepalive quota — we leave headroom so the
 * pagehide flush at the end of the session still has room to send the
 * final reading-history beacon.
 */
const KEEPALIVE_SOFT_BUDGET_BYTES = 32 * 1024;
let keepaliveBytesUsed = 0;

/**
 * Send a fire-and-forget tracking event with maximum reliability.
 *
 * Strategy (revised 2026-05-16 after a Safari "white page after deploy"
 * incident — long-lived tabs were exhausting Safari's 64KB keepalive cap
 * and subsequent CSRF + API fetches were silently failing with
 * "Load failed"):
 *
 *   1. **Page is visible** — page is alive and will stay alive long enough
 *      to complete a normal `fetch`. Use a regular non-keepalive fetch so
 *      we don't burn the precious keepalive quota on routine analytics.
 *   2. **Page is hidden / unloading** — request must survive teardown.
 *      Try `navigator.sendBeacon` first, fall back to `keepalive: true`
 *      fetch. We track cumulative keepalive bytes and refuse to spend
 *      more once we approach the 32KB soft budget — Safari simply rejects
 *      everything past 64KB cumulative, including the next CSRF fetch.
 *
 * Returns `true` if the request was queued (via beacon) or scheduled (via
 * keepalive fetch). Errors are swallowed — telemetry must never surface as
 * a toast or bubble up to the visitor.
 */
export function trackBeacon(url: string, body?: unknown): boolean {
  if (typeof window === "undefined") return false;

  let payloadString: string | undefined;
  let blobPayload: Blob | FormData | undefined;
  const contentType = "application/json";

  if (body !== undefined && body !== null) {
    if (body instanceof Blob || body instanceof FormData) {
      blobPayload = body;
    } else if (typeof body === "string") {
      payloadString = body;
    } else {
      try {
        payloadString = JSON.stringify(body);
      } catch {
        payloadString = undefined;
      }
    }
  }

  // Best-effort size estimate. Blob / FormData uses .size; JSON string
  // uses byte length approximation (UTF-8 worst case).
  const estimatedBytes =
    blobPayload instanceof Blob
      ? blobPayload.size
      : payloadString
        ? payloadString.length
        : 0;

  // Path A — page is visible: this is a regular live analytics ping. No
  // need to consume the keepalive quota; a plain fetch will complete
  // before the page goes anywhere. This is the common path for behavior
  // tracking on a long-lived Safari tab.
  const pageIsVisible =
    typeof document !== "undefined" && document.visibilityState === "visible";

  if (pageIsVisible) {
    try {
      const headers: Record<string, string> = {};
      if (payloadString !== undefined) headers["Content-Type"] = contentType;
      const token = getCsrfToken();
      if (token) headers["x-csrf-token"] = token;
      void fetch(apiUrl(url), {
        method: "POST",
        headers,
        body: blobPayload ?? payloadString,
        credentials: "include",
        // Deliberately no `keepalive: true` here — we're alive, the request
        // will resolve naturally and we keep the keepalive cap untouched
        // for the eventual pagehide flush.
      }).catch(() => {
        // Silent — telemetry must never surface to the visitor.
      });
      return true;
    } catch {
      // Fall through to beacon path below as a safety net.
    }
  }

  // Path B — page is hidden / unloading: must use beacon-class transport
  // so the request survives teardown. Spend keepalive quota carefully:
  // refuse new beacons once we're past the 32KB soft budget so the next
  // critical request (CSRF, login, etc.) still has room.
  if (keepaliveBytesUsed + estimatedBytes > KEEPALIVE_SOFT_BUDGET_BYTES) {
    return false;
  }

  // 1) Try sendBeacon (best for pagehide/beforeunload).
  try {
    if (typeof navigator !== "undefined" && typeof navigator.sendBeacon === "function") {
      const beaconBody: BodyInit | undefined =
        blobPayload !== undefined
          ? blobPayload
          : payloadString !== undefined
            ? new Blob([payloadString], { type: contentType })
            : undefined;
      const ok = beaconBody !== undefined
        ? navigator.sendBeacon(url, beaconBody)
        : navigator.sendBeacon(url);
      if (ok) {
        keepaliveBytesUsed += estimatedBytes;
        return true;
      }
    }
  } catch {
    // beacon may throw on quota — fall through to keepalive fetch
  }

  // 2) Final fallback: keepalive fetch (carries CSRF header). Silent.
  try {
    const headers: Record<string, string> = {};
    if (payloadString !== undefined) {
      headers["Content-Type"] = contentType;
    }
    const token = getCsrfToken();
    if (token) {
      headers["x-csrf-token"] = token;
    }
    void fetch(apiUrl(url), {
      method: "POST",
      headers,
      body: blobPayload ?? payloadString,
      credentials: "include",
      keepalive: true,
    }).catch(() => {
      // Silent — telemetry must never surface to the visitor.
    });
    keepaliveBytesUsed += estimatedBytes;
    return true;
  } catch {
    return false;
  }
}

function handleSessionExpiration() {
  const currentPath = window.location.pathname + window.location.search;
  if (currentPath !== '/login') {
    localStorage.setItem('redirectAfterLogin', currentPath);
  }
  
  toast({
    title: "انتهت صلاحية جلستك",
    description: "يرجى تسجيل الدخول مرة أخرى",
    variant: "destructive",
  });
  
  setTimeout(() => {
    window.location.href = '/login';
  }, 2000);
}

async function throwIfResNotOk(res: Response, silent = false) {
  if (!res.ok) {
    const text = (await res.text()) || res.statusText;
    
    if (res.status === 401 && !silent) {
      handleSessionExpiration();
    }
    
    if (res.status === 429) {
      throw new Error("RATE_LIMITED");
    }
    
    if (res.status === 502 || res.status === 503 || res.status === 504) {
      throw new Error("الخادم غير متاح مؤقتاً، يرجى المحاولة مرة أخرى");
    }
    
    if (res.status === 403) {
      try {
        const data = JSON.parse(text);
        if (data.message) {
          if (!silent) {
            toast({
              title: "تنبيه",
              description: data.message,
              variant: "destructive",
            });
          }
          throw new Error(data.message);
        }
      } catch (e) {
        if (e instanceof Error && e.message !== text) {
          throw e;
        }
      }
    }
    
    if (res.status === 409) {
      try {
        const data = JSON.parse(text);
        if (data.message) {
          throw new Error(data.message);
        }
      } catch (e) {
        if (e instanceof Error && e.message !== text) {
          throw e;
        }
      }
    }
    
    try {
      const data = JSON.parse(text);
      if (data.message) {
        throw new Error(data.message);
      }
    } catch (e) {
      if (e instanceof Error && e.message !== text) {
        throw e;
      }
    }
    
    throw new Error(`${res.status}: ${text}`);
  }
}

export async function apiRequest<T = any>(
  url: string,
  options?: {
    method?: string;
    body?: string | FormData;
    headers?: Record<string, string>;
    isFormData?: boolean;
    onUploadProgress?: (progress: { loaded: number; total: number }) => void;
    _csrfRetry?: boolean;
    silent?: boolean;
  }
): Promise<T> {
  const method = options?.method || "GET";
  const isStateChangingMethod = ["POST", "PUT", "PATCH", "DELETE"].includes(method.toUpperCase());
  const silent = options?.silent === true;

  if (isStateChangingMethod) {
    await ensureCsrfToken();
  }

  if (options?.isFormData && options.body instanceof FormData) {
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      
      xhr.upload.addEventListener('progress', (e) => {
        if (e.lengthComputable && options.onUploadProgress) {
          options.onUploadProgress({ loaded: e.loaded, total: e.total });
        }
      });

      xhr.addEventListener('load', async () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          try {
            const contentType = xhr.getResponseHeader("content-type");
            if (contentType && contentType.includes("application/json")) {
              resolve(JSON.parse(xhr.responseText));
            } else {
              resolve(xhr.response);
            }
          } catch (error) {
            reject(new Error(`Failed to parse response: ${error}`));
          }
        } else {
          if (xhr.status === 401 && !silent) {
            handleSessionExpiration();
          }
          
          if (xhr.status === 403) {
            try {
              const data = JSON.parse(xhr.responseText);
              if (data.message && (
                data.message.includes('رمز الحماية') || 
                data.message.includes('الجلسة غير متوفرة')
              )) {
                refreshCsrfToken();
                if (!silent) {
                  toast({
                    title: "يرجى المحاولة مرة أخرى",
                    description: "تم تحديث رمز الحماية",
                    variant: "default",
                  });
                }
                reject(new Error(data.message));
                return;
              }
              if (data.message) {
                if (!silent) {
                  toast({
                    title: "تنبيه",
                    description: data.message,
                    variant: "destructive",
                  });
                }
                reject(new Error(data.message));
                return;
              }
            } catch (e) {
            }
          }
          
          if (xhr.status === 409) {
            try {
              const data = JSON.parse(xhr.responseText);
              if (data.message) {
                reject(new Error(data.message));
                return;
              }
            } catch (e) {
            }
          }
          
          try {
            const data = JSON.parse(xhr.responseText);
            if (data.message) {
              reject(new Error(data.message));
              return;
            }
          } catch (e) {
          }
          
          reject(new Error(`${xhr.status}: ${xhr.responseText || xhr.statusText}`));
        }
      });

      xhr.addEventListener('error', () => {
        reject(new Error('Network error'));
      });

      xhr.open(options?.method || 'POST', apiUrl(url));
      xhr.withCredentials = true;
      
      const token = getCsrfToken();
      if (token) {
        xhr.setRequestHeader("x-csrf-token", token);
      }
      
      if (options?.headers) {
        Object.entries(options.headers).forEach(([key, value]) => {
          xhr.setRequestHeader(key, value);
        });
      }

      xhr.send(options.body);
    });
  }

  async function makeRequest(retryAttempt = 0): Promise<T> {
    const currentCsrfToken = getCsrfToken();
    
    const headers: Record<string, string> = {
      ...(options?.body && typeof options.body === 'string' ? { "Content-Type": "application/json" } : {}),
      ...(options?.headers || {}),
    };
    
    if (isStateChangingMethod && currentCsrfToken) {
      headers["x-csrf-token"] = currentCsrfToken;
    }
    
    const res = await fetch(apiUrl(url), {
      method,
      headers,
      body: typeof options?.body === 'string' ? options.body : undefined,
      credentials: "include",
    });

    if (res.status === 403 && retryAttempt === 0 && isStateChangingMethod) {
      const text = await res.clone().text();
      try {
        const data = JSON.parse(text);
        if (data.message && (
          data.message.includes('رمز الحماية') || 
          data.message.includes('الجلسة غير متوفرة')
        )) {
          await refreshCsrfToken();
          return makeRequest(1);
        }
      } catch {
      }
    }

    await throwIfResNotOk(res, silent);
    
    const contentType = res.headers.get("content-type");
    if (contentType && contentType.includes("application/json")) {
      return await res.json();
    }
    
    return res as T;
  }
  
  return makeRequest();
}

type UnauthorizedBehavior = "returnNull" | "throw";
export const getQueryFn: <T>(options: {
  on401: UnauthorizedBehavior;
  silent?: boolean;
}) => QueryFunction<T> =
  ({ on401: unauthorizedBehavior, silent = false }) =>
  async ({ queryKey }) => {
    let url = '';
    const params: Record<string, string> = {};
    
    for (const part of queryKey) {
      if (typeof part === 'string') {
        url += (url && !url.endsWith('/') ? '/' : '') + part;
      } else if (typeof part === 'object' && part !== null) {
        Object.entries(part).forEach(([key, value]) => {
          if (value !== undefined && value !== null && value !== '') {
            params[key] = String(value);
          }
        });
      }
    }
    
    const queryString = new URLSearchParams(params).toString();
    if (queryString) {
      url += (url.includes('?') ? '&' : '?') + queryString;
    }
    
    const res = await fetch(apiUrl(url), {
      credentials: "include",
    });

    if (unauthorizedBehavior === "returnNull" && res.status === 401) {
      return null as unknown as T;
    }

    await throwIfResNotOk(res, silent);
    const contentType = res.headers.get("content-type");
    if (contentType && contentType.includes("application/json")) {
      return await res.json();
    }
    const text = await res.text();
    try {
      return JSON.parse(text) as T;
    } catch {
      return null as unknown as T;
    }
  };

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      queryFn: getQueryFn({ on401: "returnNull" }),
      refetchInterval: false,
      refetchOnWindowFocus: false,
      staleTime: 300000,
      gcTime: 600000,
      retry: (failureCount, error) => {
        if (error instanceof Error && error.message === "RATE_LIMITED") {
          return failureCount < 3;
        }
        return false;
      },
      retryDelay: (attemptIndex) => Math.min(2000 * (attemptIndex + 1), 10000),
    },
    mutations: {
      retry: false,
    },
  },
});

if (typeof window !== 'undefined' && (window as any).__HOMEPAGE_DATA__) {
  queryClient.setQueryData(["/api/homepage-lite"], (window as any).__HOMEPAGE_DATA__);
  delete (window as any).__HOMEPAGE_DATA__;
}
