/**
 * إصلاح اتجاه توقّعات كأس العالم (المضيف/الضيف) + إعادة التسوية + إشعار موجّه.
 *
 * الخلفية: في تطبيقي iOS/أندرويد كانت عدّادات إدخال النتيجة معكوسة بصريًّا مقابل
 * شعارات الفريقين (صفّ العدّادات مفروض LTR بينما الشعارات RTL)، فخُزِّنت
 * predHome/predAway مقلوبة. التسوية في الخادم تطابق predHome==finalHome بدقّة،
 * فظهر «لم تُصب» لكل توقّع صحيح غير متعادل. (الإصلاح في الواجهة شُحن منفصلًا.)
 *
 * نهج «ترقية فقط، بلا أي تنزيل» — الأكثر أمانًا لأن صفحة الويب تخزّن صحيحًا
 * ولا عمود مصدر يميّز ويب/تطبيق في الصفوف القديمة:
 *   • نرقّي فقط توقّعًا «ليس أصبت» يطابق *قلبُه* النتيجة المخزّنة (= مستخدم تطبيق
 *     ظُلم): نصحّح قيمه، نعلّمه «أصبت»، ونمنحه النقاط.
 *   • لا نلمس أي توقّع «أصبت» حاليًّا ⇒ صفر سحب نقاط، صفر ضرر على مستخدمي الويب
 *     الصحيحين. (الثمن المقبول: ترقية سخيّة لقلّة توقّعوا النتيجة المعكوسة على
 *     الويب — لا أحد يخسر.)
 *   • المتعادلات تُتجاهَل (القلب لا يغيّرها، ولا ضحايا فيها).
 *
 * idempotent: المنح مكرَّر الحماية عبر dedup الولاء (source=fixtureId، نافذة ~11
 * سنة)، وصفوف رُقّيت تصبح «أصبت» فتُستبعَد في التشغيل التالي. آمن لإعادة التشغيل
 * يوميًّا لتغطية الفجوة حتى ينتشر تحديث التطبيق.
 *
 * الاستخدام (شغّله على الإنتاج عبر railway run كي يأخذ DB_DRIVER=neon + الأسرار):
 *   railway run tsx scripts/fix-wc-predictions-orientation.ts              # تجريبي (افتراضي)
 *   railway run tsx scripts/fix-wc-predictions-orientation.ts --apply      # تطبيق + إشعار
 *   railway run tsx scripts/fix-wc-predictions-orientation.ts --apply --skip-notify
 */
import { and, eq, isNotNull, sql } from "drizzle-orm";
import { db } from "../server/db";
import {
  wcPredictions,
  wcPredictionMatches,
  userLoyaltyEvents,
  notificationsInbox,
} from "@shared/schema";
import { awardPoints } from "../server/services/loyalty";
import { LOYALTY_ACTIONS } from "@shared/loyalty";
import { pushToUserDevices } from "../server/services/sportsAlertsService";
import { notificationBus } from "../server/notificationBus";

// علامة دائمة في سجلّ الولاء تميّز منح هذا الترميم عن منح التسوية العادية —
// منها نشتق جمهور الإشعار حتى لو سُوّيت البيانات في تشغيل --skip-notify سابق.
const FIX_REASON = "orientation-fix";
const NOTICE_TYPE = "wc_predictions_resettled";

const APPLY = process.argv.includes("--apply");
const SKIP_NOTIFY = process.argv.includes("--skip-notify");
const POINTS_POOL = 500;

// نسخة الإشعار المعتمدة من المالك.
const PUSH_TITLE = "أعدنا احتساب توقّعاتك ⚽";
const PUSH_BODY =
  "صحّحنا خللًا في التطبيق وأضفنا نقاطك المستحقّة في مسابقة التوقّعات — تحقّق من نقاطك الآن.";

type Award = { userId: string; fixtureId: string; points: number; score: string };

async function main() {
  console.log(`\n=== ترميم اتجاه توقّعات كأس العالم — ${APPLY ? "تطبيق" : "تجريبي"} ===\n`);

  // كل المباريات المُسوّاة بنتيجة نهائية مخزّنة (نعتمد اللقطة لا API الحيّ — المباريات
  // القديمة تسقط من قائمة المزوّد).
  const matches = await db
    .select()
    .from(wcPredictionMatches)
    .where(
      and(
        eq(wcPredictionMatches.status, "settled"),
        isNotNull(wcPredictionMatches.finalHome),
        isNotNull(wcPredictionMatches.finalAway),
      ),
    );

  let totalUpgraded = 0;
  let matchesTouched = 0;
  const upgradedUserIds = new Set<string>();
  const awards: Award[] = [];

  for (const m of matches) {
    const fh = m.finalHome as number;
    const fa = m.finalAway as number;
    if (fh === fa) continue; // متعادل — لا قلب، لا ضحايا.

    const preds = await db
      .select()
      .from(wcPredictions)
      .where(eq(wcPredictions.fixtureId, m.fixtureId));

    // مؤهّل للترقية: ليس «أصبت»، وقيمه المخزّنة = (finalAway, finalHome) أي قلبه
    // يطابق النتيجة بالضبط (توقّع تطبيق ظُلم بالقلب).
    const toUpgrade = preds.filter(
      (p) => p.status !== "correct" && p.predHome === fa && p.predAway === fh,
    );
    if (toUpgrade.length === 0) continue;

    const alreadyCorrect = preds.filter((p) => p.status === "correct").length;
    const finalWinners = alreadyCorrect + toUpgrade.length;
    // نمنح المرقّى نفس حصّة الفائزين الأصليين (بلا سحب من أحد)؛ وإن لم يكن للمباراة
    // فائزون أصلًا فالقسمة العادلة على المرقّين.
    const share =
      m.pointsPerWinner && m.pointsPerWinner > 0
        ? m.pointsPerWinner
        : Math.max(1, Math.floor(POINTS_POOL / toUpgrade.length));

    matchesTouched++;
    totalUpgraded += toUpgrade.length;
    for (const p of toUpgrade) {
      upgradedUserIds.add(p.userId);
      awards.push({ userId: p.userId, fixtureId: m.fixtureId, points: share, score: `${fh}-${fa}` });
    }

    console.log(
      `  • ${m.homeTeamName} ${fh}-${fa} ${m.awayTeamName}: ترقية ${toUpgrade.length} ` +
        `(فائزون ${alreadyCorrect}→${finalWinners}، ${share}/فائز)`,
    );

    if (APPLY) {
      await db.transaction(async (tx) => {
        const now = new Date();
        for (const p of toUpgrade) {
          // قلب القيم لتصحيح العرض + تعليمها «أصبت» + النقاط.
          await tx
            .update(wcPredictions)
            .set({
              predHome: fh,
              predAway: fa,
              status: "correct",
              pointsAwarded: share,
              settledAt: p.settledAt ?? now,
              updatedAt: now,
            })
            .where(eq(wcPredictions.id, p.id));
        }
        // نحدّث عدد الفائزين فقط (لا نخفض حصّة من نالوا أكثر — لا سحب).
        await tx
          .update(wcPredictionMatches)
          .set({ winnersCount: finalWinners, updatedAt: now })
          .where(eq(wcPredictionMatches.fixtureId, m.fixtureId));
      });
    }
  }

  console.log(
    `\nالإجمالي: ${totalUpgraded} توقّعًا للترقية عبر ${matchesTouched} مباراة، ` +
      `${upgradedUserIds.size} مستخدمًا متأثّرًا.`,
  );

  if (!APPLY) {
    console.log("\n(تشغيل تجريبي — لم تُكتب أي تغييرات. أضِف --apply للتطبيق.)\n");
    process.exit(0);
  }

  // منح النقاط — idempotent عبر dedup الولاء (source=fixtureId). الـmetadata.reason
  // علامتنا الدائمة التي نشتق منها جمهور الإشعار لاحقًا.
  let awardedCount = 0;
  for (const a of awards) {
    const outcome = await awardPoints({
      userId: a.userId,
      action: LOYALTY_ACTIONS.WC_PREDICTION_WIN,
      source: a.fixtureId,
      points: a.points,
      metadata: { fixtureId: a.fixtureId, score: a.score, reason: FIX_REASON },
    });
    if (outcome.awarded) awardedCount++;
  }
  console.log(`نقاط مُنحت فعليًّا (بعد dedup): ${awardedCount} من ${awards.length}.`);

  if (SKIP_NOTIFY) {
    console.log("تخطّي الإشعار (--skip-notify). أعِده بـ--apply لاحقًا لإرساله.\n");
    process.exit(0);
  }

  await notifyCorrectedUsers();
  process.exit(0);
}

/**
 * إشعار كل من صحّحناه — صندوق التطبيق (notificationsInbox) + بثّ لحظي + Push للنظام.
 * الجمهور يُشتق من علامة سجلّ الولاء (لا من ترقية هذا التشغيل) فيعمل حتى لو سُوّيت
 * البيانات سابقًا بـ--skip-notify. idempotent: نتخطّى من سبق أن وصله الإشعار نفسه.
 */
async function notifyCorrectedUsers(): Promise<void> {
  const rows = await db
    .selectDistinct({ userId: userLoyaltyEvents.userId })
    .from(userLoyaltyEvents)
    .where(
      and(
        eq(userLoyaltyEvents.action, LOYALTY_ACTIONS.WC_PREDICTION_WIN),
        sql`${userLoyaltyEvents.metadata} ->> 'reason' = ${FIX_REASON}`,
      ),
    );

  let sent = 0;
  let skipped = 0;
  for (const { userId } of rows) {
    const [existing] = await db
      .select({ id: notificationsInbox.id })
      .from(notificationsInbox)
      .where(and(eq(notificationsInbox.userId, userId), eq(notificationsInbox.type, NOTICE_TYPE)))
      .limit(1);
    if (existing) {
      skipped++;
      continue;
    }
    try {
      await db.insert(notificationsInbox).values({
        userId,
        type: NOTICE_TYPE,
        title: PUSH_TITLE,
        body: PUSH_BODY,
        deeplink: "", // لا مسار توقّعات في موجّه روابط التطبيق الحالي — يفتح التطبيق
        read: false,
        metadata: { reason: FIX_REASON },
      });
      notificationBus.emit(userId, { type: NOTICE_TYPE, title: PUSH_TITLE, body: PUSH_BODY, deeplink: "" });
    } catch (err) {
      console.error(`[fix-wc] فشل إدراج الصندوق/البثّ للمستخدم ${userId}:`, err);
    }
    await pushToUserDevices(userId, PUSH_TITLE, PUSH_BODY, {
      type: NOTICE_TYPE,
      screen: "world-cup-predictions",
    });
    sent++;
  }
  console.log(`الإشعار: أُرسل إلى ${sent} مستخدمًا، وتُخطّي ${skipped} (وصلهم سابقًا).\n`);
}

main().catch((err) => {
  console.error("فشل ترميم التوقّعات:", err);
  process.exit(1);
});
