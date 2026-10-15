const CLIENT_API_BASE = (process.env.NEXT_PUBLIC_API_URL || "").replace(/\/+$/, "");
const browserApiUrl = (path: string) => CLIENT_API_BASE && path.startsWith("/api/") ? CLIENT_API_BASE + path : path;

export async function clientApiPost<T = unknown>(path: string, body: unknown): Promise<{ response: Response; data: T }> {
  const csrfResponse = await fetch(browserApiUrl("/api/csrf-token"), { credentials: "include" });
  if (!csrfResponse.ok) throw new Error("تعذر تهيئة جلسة الحماية.");
  const { csrfToken } = await csrfResponse.json() as { csrfToken?: string };
  if (!csrfToken) throw new Error("رمز الحماية غير متوفر.");
  const response = await fetch(browserApiUrl(path), { method: "POST", credentials: "include", headers: { "Content-Type": "application/json", "X-CSRF-Token": csrfToken }, body: JSON.stringify(body) });
  return { response, data: await response.json() as T };
}
