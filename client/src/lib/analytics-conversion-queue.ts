import { ensureAnalyticsReady, isAnalyticsAllowed } from "@/lib/analytics-privacy";

export type ConversionEvent = "login" | "sign_up";
export type ConversionMethod = "email" | "phone" | "google" | "apple";
export type Conversion = { event: ConversionEvent; method: ConversionMethod; nonce: string; createdAt: number };
const KEY = "sabq:analytics-conversions";
const TTL = 5 * 60 * 1000;
let memory: Conversion[] = [];
let storageWriteFailed = false;
function read(): Conversion[] {
  if (storageWriteFailed) return memory;
  try {
    const raw = sessionStorage.getItem(KEY);
    if (raw === null) return memory;
    const value = JSON.parse(raw);
    if (Array.isArray(value)) return value;
  } catch {}
  return memory;
}
function write(value: Conversion[]) {
  memory = value;
  try {
    sessionStorage.setItem(KEY, JSON.stringify(value));
    storageWriteFailed = false;
  } catch {
    // Do not reread an older persisted queue after a quota/write failure.
    storageWriteFailed = true;
  }
}
function fresh(value: Conversion[]) {
  const now = Date.now();
  return value.filter(item => item && (item.event === "login" || item.event === "sign_up") &&
    (item.method === "email" || item.method === "phone" || item.method === "google" || item.method === "apple") &&
    typeof item.nonce === "string" && item.nonce.length >= 20 && Number.isFinite(item.createdAt) &&
    item.createdAt <= now + 60_000 && now - item.createdAt <= TTL);
}
export function enqueueConversion(event: ConversionEvent, method: ConversionMethod, originalNonce?: string) {
  const id = originalNonce || (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function" ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`);
  const items = fresh(read());
  if (items.some(item => item.nonce === id)) return;
  write([...items, { event, method, nonce: id, createdAt: Date.now() }]);
}
export function clearConversionQueue() { write([]); }
export function flushConversionQueue(send: (event: ConversionEvent, method: ConversionMethod) => void): boolean {
  if (!isAnalyticsAllowed() || !ensureAnalyticsReady()) return false;
  const items = fresh(read());
  for (const item of items) send(item.event, item.method);
  write([]);
  return true;
}
