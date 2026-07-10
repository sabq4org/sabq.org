/**
 * تنبيهات الانتقالات (سعودية مؤكّدة + عالمية بارزة).
 *
 * دورة دوريّة تكتشف الصفقات المؤكّدة الجديدة وتبثّها لمن فعّل المفتاح المناسب في
 * تفضيلاته (بثّ عام — لا يقتصر على متابعي نادٍ، بخلاف تنبيهات المباريات):
 *   1) إشعار داخل التطبيق → notifications_inbox + بثّ لحظي (notificationBus)
 *   2) إشعار دفعي          → APNs (iOS) + FCM عبر pushToUserDevices
 *
 * المصدران:
 *   - السعودية: getLeagueTransfers() (روشن) — لكل صفقة معرّف ثابت.
 *   - العالمية: getGlobalConfirmed() (SportMonks) مُرشَّحة major && !saudi.
 *
 * مبادئ التصميم (مطابقة لـ sportsAlertsService):
 *   - خطّ أساس ضدّ الإغراق: أول دورة بعد كل إقلاع تسجّل كل الـids الحالية بلا
 *     إرسال (تتجنّب دفع مئات الصفقات التاريخية عند التشغيل). يصمد لإعادة النشر
 *     عبر Redis (أفضل جهد؛ غيابه = سلوك الذاكرة).
 *   - حارس حداثة: لا يُرسَل إلا ما تاريخه ضمن آخر أيام قليلة (أمان إضافي ضد صفٍّ
 *     قديم يظهر متأخرًا بعد إعادة ضبط الأساس).
 *   - فشل التوصيل لمستخدم لا يكسر بقيّة الدورة (محصّن بـ try/catch).
 */
import { and, eq } from "drizzle-orm";
import { db } from "../db";
import { notificationsInbox, pushDevices } from "@shared/schema";
import { notificationBus } from "../notificationBus";
import { getRedisClient } from "../redis";
import { getLeagueTransfers } from "./saudiLeagueService";
import { getGlobalConfirmed, isTransferRumoursConfigured } from "./transferCenterService";
import { filterUsersByEventPref } from "./sportsAlertPrefsService";
import { pushToUserDevices } from "./sportsAlertsService";

// حزمة تطبيق الرياضة (apns-topic) — نُوجّه الإشعار لمن سجّل جهازًا بهذا التطبيق فقط.
const SPORTS_BUNDLE_ID = process.env.APNS_SPORTS_BUNDLE_ID || "com.sabq.sports";

// لا نُرسل صفقةً أقدم من هذا العمر حتى لو ظهرت كـ«جديدة» (بعد إعادة ضبط الأساس).
const MAX_AGE_DAYS = 3;

// سقف الصفقات العالمية المُرسَلة في الدورة الواحدة. حتى بعد تضييق تعريف «بارزة»،
// قد تتأكّد عدّة صفقات كبرى في نافذةٍ واحدة؛ الفائض يُعلَّم مرصودًا (فلا يعود) بلا
// دفعة إشعارات متلاحقة. قابل للضبط عبر SPORTS_TRANSFER_MAX_GLOBAL_PER_CYCLE.
const MAX_GLOBAL_PER_CYCLE = Number(process.env.SPORTS_TRANSFER_MAX_GLOBAL_PER_CYCLE ?? 3);

// سقف الصفقات السعودية الفردية في الدورة. عند تجاوزه نُرسل إشعارًا واحدًا مجمّعًا
// بدل دفعة 5+ متلاحقة (كاش ساعة + دورة 10 دقائق كانت تُفرغ دفعةً دفعة). قابل
// للضبط عبر SPORTS_TRANSFER_MAX_SAUDI_PER_CYCLE.
const MAX_SAUDI_PER_CYCLE = Number(process.env.SPORTS_TRANSFER_MAX_SAUDI_PER_CYCLE ?? 2);

type TransferScope = "saudi" | "global";

interface DetectedTransferAlert {
  key: string; // مفتاح إزالة التكرار (مع بادئة النطاق)
  scope: TransferScope;
  title: string;
  body: string;
  playerId: number; // 0 لمصادر SportMonks (معرّفها لا يصلح لصفحة اللاعب)
}

// الـids التي سبق رصدها لكل نطاق (بادئة النطاق مدمجة في المفتاح).
const seenSaudi = new Set<string>();
const seenGlobal = new Set<string>();

// ── صمود خطّ الأساس لإعادة النشر (Redis، أفضل جهد) ──
const STATE_KEY = "transfer_alerts:baseline:v1";
const STATE_TTL_SEC = 14 * 24 * 3600; // نافذة انتقالات كاملة
let stateHydrated = false;

async function hydrateStateOnce(): Promise<void> {
  if (stateHydrated) return;
  stateHydrated = true;
  const redis = getRedisClient();
  if (!redis) return;
  try {
    const raw = await redis.get(STATE_KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw) as { saudi?: string[]; global?: string[] };
    for (const id of parsed.saudi ?? []) seenSaudi.add(id);
    for (const id of parsed.global ?? []) seenGlobal.add(id);
    console.log(
      `[TransferAlerts] baseline hydrated from Redis (saudi=${seenSaudi.size} global=${seenGlobal.size})`,
    );
  } catch (err) {
    console.error("[TransferAlerts] baseline hydrate failed:", err);
  }
}

async function persistState(): Promise<void> {
  const redis = getRedisClient();
  if (!redis) return;
  try {
    const payload = JSON.stringify({ saudi: [...seenSaudi], global: [...seenGlobal] });
    await redis.set(STATE_KEY, payload, { expiration: { type: "EX", value: STATE_TTL_SEC } });
  } catch (err) {
    console.error("[TransferAlerts] baseline persist failed:", err);
  }
}

function isRecent(dateIso: string): boolean {
  const cutoff = new Date(Date.now() - MAX_AGE_DAYS * 24 * 3600 * 1000)
    .toISOString()
    .slice(0, 10);
  return dateIso >= cutoff;
}

/** كشف الصفقات السعودية المؤكّدة الجديدة (أول دورة = خطّ أساس بلا إرسال). */
async function detectSaudi(): Promise<DetectedTransferAlert[]> {
  let transfers: Awaited<ReturnType<typeof getLeagueTransfers>>["transfers"];
  try {
    transfers = (await getLeagueTransfers()).transfers;
  } catch (err) {
    console.error("[TransferAlerts] getLeagueTransfers failed:", err);
    return [];
  }
  const baseline = seenSaudi.size === 0;
  const fresh: DetectedTransferAlert[] = [];
  for (const t of transfers) {
    const key = `s:${t.id}`;
    if (seenSaudi.has(key)) continue;
    seenSaudi.add(key);
    if (baseline) continue; // أول دورة: أساس فقط
    if (!isRecent(t.date)) continue;
    fresh.push({
      key,
      scope: "saudi",
      title: "🟢 صفقة سعودية مؤكّدة",
      body: `${t.player.name} إلى ${t.to.name}`,
      playerId: t.player.id,
    });
  }
  // ضمن السقف: إشعارات فردية. فوقه: إشعار واحد مجمّع (كل الـids مُعلَّمة مرصودة أعلاه).
  if (fresh.length <= MAX_SAUDI_PER_CYCLE) return fresh;
  const preview = fresh
    .slice(0, 3)
    .map((a) => a.body)
    .join(" · ");
  const extra = fresh.length > 3 ? ` · و${fresh.length - 3} أخرى` : "";
  return [
    {
      key: `s:digest:${fresh.map((a) => a.key).join(",")}`,
      scope: "saudi",
      title: `🟢 ${fresh.length} صفقات سعودية جديدة`,
      body: `${preview}${extra}`,
      playerId: 0,
    },
  ];
}

/** كشف الصفقات العالمية البارزة المؤكّدة الجديدة (major && !saudi). */
async function detectGlobal(): Promise<DetectedTransferAlert[]> {
  if (!isTransferRumoursConfigured()) return [];
  let confirmed: Awaited<ReturnType<typeof getGlobalConfirmed>>;
  try {
    confirmed = await getGlobalConfirmed();
  } catch (err) {
    console.error("[TransferAlerts] getGlobalConfirmed failed:", err);
    return [];
  }
  const majors = confirmed.filter((t) => t.major && !t.saudi);
  const baseline = seenGlobal.size === 0;
  const out: DetectedTransferAlert[] = [];
  for (const t of majors) {
    const key = `g:${t.id}`;
    if (seenGlobal.has(key)) continue;
    seenGlobal.add(key);
    if (baseline) continue;
    if (!isRecent(t.date)) continue;
    // سقف الدورة: نُعلّم الفائض مرصودًا (لن يُعاد) لكن لا نُرسله — منعًا للإغراق.
    if (out.length >= MAX_GLOBAL_PER_CYCLE) continue;
    out.push({
      key,
      scope: "global",
      title: "🌍 صفقة عالمية بارزة",
      body: `${t.player.name} إلى ${t.to.name}`,
      playerId: 0, // معرّف SportMonks لا يصلح لصفحة اللاعب
    });
  }
  return out;
}

/** مستخدمو تطبيق الرياضة المرشّحون للبثّ (لهم جهاز نشط بحزمة الرياضة). */
async function getSportsAppUserIds(): Promise<string[]> {
  try {
    const rows = await db
      .selectDistinct({ userId: pushDevices.userId })
      .from(pushDevices)
      .where(and(eq(pushDevices.isActive, true), eq(pushDevices.bundleId, SPORTS_BUNDLE_ID)));
    return rows.map((r) => r.userId).filter((id): id is string => Boolean(id));
  } catch (err) {
    console.error("[TransferAlerts] getSportsAppUserIds failed:", err);
    return [];
  }
}

/** توصيل تنبيه انتقال واحد لكل من فعّل مفتاح نطاقه (inbox + بثّ + دفع). */
async function dispatchTransfer(
  alert: DetectedTransferAlert,
  candidates: string[],
): Promise<number> {
  if (candidates.length === 0) return 0;
  const prefKey = alert.scope === "saudi" ? "transfersSaudi" : "transfersGlobal";
  const userIds = await filterUsersByEventPref(candidates, prefKey);
  if (userIds.length === 0) return 0;

  const type = `sports.transfer.${alert.scope}`;
  const deeplink = "/sports/transfers";
  const pushData: Record<string, string> = {
    type,
    deeplink: "sabqsports://transfers",
    priority: "time-sensitive",
  };

  await Promise.all(
    userIds.map(async (userId) => {
      try {
        await db.insert(notificationsInbox).values({
          userId,
          type,
          title: alert.title,
          body: alert.body,
          deeplink,
          read: false,
          metadata: { scope: alert.scope, playerId: alert.playerId },
        });
        notificationBus.emit(userId, {
          type,
          title: alert.title,
          body: alert.body,
          deeplink,
        });
      } catch (err) {
        console.error(`[TransferAlerts] inbox/emit for user ${userId} failed:`, err);
      }
    }),
  );

  const claimedInstallations = new Set<string>();
  for (const userId of userIds) {
    await pushToUserDevices(userId, alert.title, alert.body, pushData, { claimedInstallations });
  }
  return userIds.length;
}

export interface TransferAlertsCycleSummary {
  saudiNew: number;
  globalNew: number;
  recipients: number;
}

/** دورة واحدة: اكتشاف الصفقات الجديدة + بثّها لمن فعّل مفتاح نطاقها. */
export async function runTransferAlertsCycle(): Promise<TransferAlertsCycleSummary> {
  await hydrateStateOnce();
  const [saudi, global] = await Promise.all([detectSaudi(), detectGlobal()]);
  const alerts = [...saudi, ...global];

  let recipients = 0;
  if (alerts.length > 0) {
    // نجلب المرشّحين مرّةً واحدة (البثّ عام لكل الصفقات في هذه الدورة).
    const candidates = await getSportsAppUserIds();
    for (const alert of alerts) {
      recipients += await dispatchTransfer(alert, candidates);
    }
  }

  await persistState();
  return { saudiNew: saudi.length, globalNew: global.length, recipients };
}
