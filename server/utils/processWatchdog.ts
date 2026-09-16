/**
 * حارس العملية — شفاء ذاتي بدل «حية ظاهريًا معطلة فعليًا».
 *
 * حادثة فجر 2026-07-25 (04:13–08:07): تسرّب ذاكرة رفع RSS من 1.0 إلى
 * 3.14GB فتجمّدت حلقة الأحداث بوقفات GC وفشل كل اتصال بقاعدة البيانات
 * («timeout exceeded when trying to connect») لأربع ساعات. Railway لا يفحص
 * الصحة إلا وقت النشر، والعملية لم تنهر فلم يُعِد تشغيلها أحد — الشفاء
 * الوحيد كان redeploy يدويًا الساعة 08:07.
 *
 * الفكرة: العملية تراقب نفسها بثلاثة معايير، وعند ثبوت المرض تخرج خروجًا
 * منضبطًا بـexit(1) — وسياسة ON_FAILURE في railway.json تعيد التشغيل خلال
 * ثوانٍ. توقف دقيقة بدل ساعات.
 *
 * المعايير (كل فحص كل 30 ثانية، والعتبات قابلة للضبط بمتغيرات البيئة):
 *   1. ذروة تأخر حلقة الأحداث > WATCHDOG_LAG_EXIT_MS (5000) في 3 فحوص
 *      متتالية — بصمة اختناق GC التي أسقطتنا فجرًا.
 *   2. RSS > WATCHDOG_RSS_EXIT_MB (2560) في 10 فحوص متتالية (5 دقائق) —
 *      خروج مبكر رشيق قبل أن يصل V8 لسقف --max-old-space-size وينهار بعنف.
 *   3. فشل مسبار SELECT 1 (مهلة 5 ثوانٍ) في 6 فحوص متتالية (3 دقائق) —
 *      لا يُحتسب إلا بعد أول اتصال ناجح كي لا يقتل الإقلاع البارد.
 *
 * حواجز ضد حلقة إعادة التشغيل:
 *   - لا يتسلّح قبل WATCHDOG_ARM_AFTER_S (600 ثانية) من الإقلاع.
 *   - المعايير تتطلب ثباتًا متتاليًا؛ أي فحص سليم يصفّر عدّاده.
 *   - سقف الإعادات الخارجي هو restartPolicyMaxRetries في railway.json.
 *   - كل خروج يُبلَّغ إلى Sentry بمستوى fatal فلا يحدث بصمت.
 *
 * حدّ معروف: لو تجمّدت الحلقة تجمّدًا مطلقًا لا تعمل مؤقتاتنا أصلًا —
 * تلك الحالة يغطيها سقف V8 (--max-old-space-size) الذي يُسقط العملية
 * بانهيار صريح تلتقطه ON_FAILURE. وقفات GC الطويلة (حالة الفجر) تؤخر
 * المؤقتات ولا تلغيها، فيلتقطها المعيار الأول عند استئناف الحلقة.
 */
import type { Server } from "http";
import * as Sentry from "@sentry/node";
import { runtimeSnapshot } from "./runtimeDiagnostics";

const CHECK_INTERVAL_MS = 30_000;
const LAG_PROBE_MS = 500;
const DB_PROBE_TIMEOUT_MS = 5_000;

const ARM_AFTER_S = envInt("WATCHDOG_ARM_AFTER_S", 600);
const LAG_EXIT_MS = envInt("WATCHDOG_LAG_EXIT_MS", 5_000);
const LAG_STRIKES = 3;
const RSS_EXIT_MB = envInt("WATCHDOG_RSS_EXIT_MB", 2_560);
const RSS_STRIKES = 10;
const DB_FAIL_STRIKES = 6;

function envInt(name: string, fallback: number): number {
  const n = parseInt(process.env[name] || "", 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

let started = false;
let exiting = false;

// ذروة التأخر منذ آخر فحص. لا نقرأ maxLoopLagMs من runtimeDiagnostics لأنه
// يصفّره مع كل عيّنة من مؤقّته هو — سباق يجعل القراءة غير حتمية.
let peakLagMs = 0;

async function dbProbe(): Promise<"ok" | "fail" | "skip"> {
  // فشل الاستيراد أو غياب المسبح = «تخطٍّ» وليس «فشلًا» — احتسابه فشلًا
  // يعني أن أي تغيّر في شكل db.ts يراكم ضربات ويقتل عملية سليمة في حلقة.
  let pool: { query: (sql: string) => Promise<unknown> };
  try {
    // استيراد كسول كما في runtimeDiagnostics — db.ts يجرّ المخطط كاملًا.
    const dbMod = require("../db");
    if (!dbMod?.pool || typeof dbMod.isDatabaseReadyOnce !== "function") return "skip";
    if (!dbMod.isDatabaseReadyOnce()) return "skip";
    pool = dbMod.pool;
  } catch {
    return "skip";
  }
  try {
    await Promise.race([
      pool.query("SELECT 1"),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error("watchdog probe timeout")), DB_PROBE_TIMEOUT_MS).unref(),
      ),
    ]);
    return "ok";
  } catch {
    return "fail";
  }
}

function shutdown(server: Server, reason: string): void {
  if (exiting) return;
  exiting = true;

  const s = runtimeSnapshot();
  const detail =
    `rss=${s.rssMb}MB heap=${s.heapUsedMb}/${s.heapTotalMb}MB loopLag=${s.loopLagMs}ms ` +
    `fd=${s.openFds ?? "?"} sockets=${s.sockets} pool=${s.pool ? `${s.pool.total}/${s.pool.idle}idle/${s.pool.waiting}wait` : "?"}`;
  console.error(`[Watchdog] 🔴 خروج ذاتي: ${reason} — ${detail}`);

  Sentry.captureMessage(`[Watchdog] self-restart: ${reason}`, {
    level: "fatal",
    extra: { detail, snapshot: s },
  });

  // أوقف قبول اتصالات جديدة ثم اخرج؛ ومهلة قصوى 5 ثوانٍ لو علّق الإغلاق
  // نفسه (عملية مريضة أصلًا). flush لسنتري بمهلة ضمن نفس النافذة.
  const force = setTimeout(() => process.exit(1), 5_000);
  force.unref();
  void Promise.resolve(Sentry.flush(3_000))
    .catch(() => {})
    .then(() => {
      try {
        server.close(() => process.exit(1));
      } catch {
        process.exit(1);
      }
      setTimeout(() => process.exit(1), 1_000).unref();
    });
}

export function startProcessWatchdog(server: Server): void {
  if (started) return;
  started = true;

  if ((process.env.WATCHDOG_ENABLED || "true").toLowerCase() === "false") {
    console.log("[Watchdog] معطّل عبر WATCHDOG_ENABLED=false");
    return;
  }

  // مسبار تأخر الحلقة الخاص بالحارس — يسجّل الذروة بين فحصين.
  let last = Date.now();
  const lagTimer = setInterval(() => {
    const now = Date.now();
    const lag = Math.max(0, now - last - LAG_PROBE_MS);
    if (lag > peakLagMs) peakLagMs = lag;
    last = now;
  }, LAG_PROBE_MS);
  lagTimer.unref();

  let lagStrikes = 0;
  let rssStrikes = 0;
  let dbStrikes = 0;

  const checkTimer = setInterval(() => {
    if (exiting) return;
    if (process.uptime() < ARM_AFTER_S) {
      peakLagMs = 0;
      return;
    }

    const peak = peakLagMs;
    peakLagMs = 0;

    lagStrikes = peak > LAG_EXIT_MS ? lagStrikes + 1 : 0;
    if (lagStrikes >= LAG_STRIKES) {
      shutdown(server, `event-loop lag ${peak}ms لثلاث فحوص متتالية (عتبة ${LAG_EXIT_MS}ms)`);
      return;
    }

    const rssMb = Math.round(process.memoryUsage().rss / 1024 / 1024);
    rssStrikes = rssMb > RSS_EXIT_MB ? rssStrikes + 1 : 0;
    if (rssStrikes >= RSS_STRIKES) {
      shutdown(server, `RSS ${rssMb}MB فوق ${RSS_EXIT_MB}MB لخمس دقائق متصلة`);
      return;
    }

    if (lagStrikes > 0 || rssStrikes > 0) {
      console.warn(
        `[Watchdog] ⚠️ إنذار متراكم — lag=${lagStrikes}/${LAG_STRIKES} (ذروة ${peak}ms) rss=${rssStrikes}/${RSS_STRIKES} (${rssMb}MB)`,
      );
    }

    void dbProbe().then((r) => {
      if (exiting || r === "skip") return;
      dbStrikes = r === "fail" ? dbStrikes + 1 : 0;
      if (dbStrikes > 0) {
        console.warn(`[Watchdog] ⚠️ مسبار قاعدة البيانات فاشل — ${dbStrikes}/${DB_FAIL_STRIKES}`);
      }
      if (dbStrikes >= DB_FAIL_STRIKES) {
        shutdown(server, `فشل مسبار SELECT 1 لثلاث دقائق متصلة (${DB_FAIL_STRIKES} فحوص)`);
      }
    });
  }, CHECK_INTERVAL_MS);
  checkTimer.unref();

  console.log(
    `[Watchdog] 🛡️ يعمل — يتسلّح بعد ${ARM_AFTER_S}ث؛ عتبات: lag>${LAG_EXIT_MS}ms×${LAG_STRIKES}, rss>${RSS_EXIT_MB}MB×${RSS_STRIKES}, db-fail×${DB_FAIL_STRIKES}`,
  );
}
