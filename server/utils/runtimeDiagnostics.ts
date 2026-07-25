/**
 * قياس دوري لموارد العملية — أُضيف بعد أن أثبتت حوادث 2026-07-24/25 أن كل
 * تشخيص جرى حتى الآن كان استدلالًا من أعراض، لا قياسًا.
 *
 * ما رصدته سجلات 07-25 (06:36 إقلاع → 07:37): الحاوية نظيفة أول نصف ساعة
 * (أقل من 10 طلبات بطيئة/دقيقة)، ثم تدهور **تصاعدي متصل** حتى 600 طلب
 * بطيء/دقيقة وذُرى تبلغ 99 ثانية. وأول `ETIMEDOUT AggregateError` على
 * اتصال صادر ظهر في الدقيقة 07:11 — نفس الدقيقة التي قفز فيها البطء الوارد.
 * عجزٌ عن فتح مقبس صادر وعجزٌ عن قبول وارد يشتركان في مورد واحد: واصفات
 * الملفات. التدهور التصاعدي من الإقلاع = تسرّب، لا ازدحام.
 *
 * هذه الوحدة تقيس المشتبهين الأربعة مباشرة كل 30 ثانية:
 *   - fd: عدد واصفات الملفات المفتوحة (المقياس الحاسم للتسرّب)
 *   - sockets/handles: مقابض libuv النشطة موزّعة بالنوع
 *   - pool: اتصالات Postgres (total/idle/waiting) — waiting>0 يعني تشبّعًا
 *   - heap/rss + تأخر حلقة الأحداث — يميّزان ضغط الذاكرة عن حجب المعالج
 *
 * كلها قراءات رخيصة: readdir على /proc/self/fd ومؤشرات في الذاكرة.
 */
import fs from "fs";

const SAMPLE_INTERVAL_MS = 30_000;
const LAG_PROBE_MS = 500;

let loopLagMs = 0;
let maxLoopLagMs = 0;
let started = false;

/** عدد واصفات الملفات المفتوحة (Linux فقط؛ null على غيره). */
function openFdCount(): number | null {
  try {
    return fs.readdirSync("/proc/self/fd").length;
  } catch {
    return null;
  }
}

/** مقابض libuv النشطة موزّعة بالنوع — Socket/TLSSocket هي الاتصالات. */
function handlesByType(): { total: number; sockets: number; byType: Record<string, number> } {
  const getHandles = (process as any)._getActiveHandles;
  if (typeof getHandles !== "function") return { total: 0, sockets: 0, byType: {} };
  let handles: any[] = [];
  try {
    handles = getHandles.call(process) || [];
  } catch {
    return { total: 0, sockets: 0, byType: {} };
  }
  const byType: Record<string, number> = {};
  let sockets = 0;
  for (const h of handles) {
    const name = h?.constructor?.name || "Unknown";
    byType[name] = (byType[name] || 0) + 1;
    if (name === "Socket" || name === "TLSSocket") sockets += 1;
  }
  return { total: handles.length, sockets, byType };
}

export interface RuntimeSnapshot {
  uptimeS: number;
  rssMb: number;
  heapUsedMb: number;
  heapTotalMb: number;
  externalMb: number;
  openFds: number | null;
  handles: number;
  sockets: number;
  handlesByType: Record<string, number>;
  pool: { total: number; idle: number; waiting: number } | null;
  loopLagMs: number;
  maxLoopLagMs: number;
}

export function runtimeSnapshot(): RuntimeSnapshot {
  const mem = process.memoryUsage();
  const mb = (n: number) => Math.round(n / 1024 / 1024);
  const h = handlesByType();

  let pool: RuntimeSnapshot["pool"] = null;
  try {
    // استيراد كسول: db.ts يستورد المخطط كاملًا، ولا نريد حلقة استيراد.
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { getPoolStats } = require("../db");
    const s = getPoolStats();
    pool = { total: s.total ?? 0, idle: s.idle ?? 0, waiting: s.waiting ?? 0 };
  } catch {
    /* المسبح غير مهيّأ بعد */
  }

  return {
    uptimeS: Math.round(process.uptime()),
    rssMb: mb(mem.rss),
    heapUsedMb: mb(mem.heapUsed),
    heapTotalMb: mb(mem.heapTotal),
    externalMb: mb(mem.external),
    openFds: openFdCount(),
    handles: h.total,
    sockets: h.sockets,
    handlesByType: h.byType,
    pool,
    loopLagMs: Math.round(loopLagMs),
    maxLoopLagMs: Math.round(maxLoopLagMs),
  };
}

export function startRuntimeDiagnostics(): void {
  if (started) return;
  started = true;

  // تأخر حلقة الأحداث: الفارق بين الموعد المتوقع والفعلي للمؤقّت.
  let last = Date.now();
  const lagTimer = setInterval(() => {
    const now = Date.now();
    loopLagMs = Math.max(0, now - last - LAG_PROBE_MS);
    if (loopLagMs > maxLoopLagMs) maxLoopLagMs = loopLagMs;
    last = now;
  }, LAG_PROBE_MS);
  lagTimer.unref();

  const sampleTimer = setInterval(() => {
    const s = runtimeSnapshot();
    // سطر واحد قابل للـgrep — ابحث عن "[Runtime]" في سجلات Railway.
    console.log(
      `[Runtime] up=${s.uptimeS}s rss=${s.rssMb}MB heap=${s.heapUsedMb}/${s.heapTotalMb}MB ext=${s.externalMb}MB ` +
        `fd=${s.openFds ?? "?"} sockets=${s.sockets} handles=${s.handles} ` +
        `pool=${s.pool ? `${s.pool.total}/${s.pool.idle}idle/${s.pool.waiting}wait` : "?"} ` +
        `loopLag=${s.loopLagMs}ms peak=${s.maxLoopLagMs}ms`,
    );
    maxLoopLagMs = 0;
  }, SAMPLE_INTERVAL_MS);
  sampleTimer.unref();

  console.log(`[Runtime] قياس الموارد يعمل — عيّنة كل ${SAMPLE_INTERVAL_MS / 1000}ث (ابحث عن "[Runtime]")`);
}
