/**
 * الدقيقة الحيّة — تعدّ محليًا كل ثانية أثناء اللعب بدل عرض لقطة الخادم الجامدة.
 *
 * الخلفية: `status.elapsed` يصل من المزوّد كرقم ثابت، وبين كل تحديث شبكة وآخر
 * (refetch كل 15–30ث + كاش المتصفح/الـCDN) يبقى مجمّدًا فيبدو الوقت متوقفًا.
 * هنا نشتق ساعة محلية من آخر دقيقة وصلت + لحظة وصولها، فتتقدّم سلسًا، ويعيد
 * كل تحديث جديد ضبطها على رقم المزوّد الرسمي (مع وقت بدل الضائع).
 *
 * تعدّ فقط في أشواط اللعب الفعلية، وتتجمّد في الاستراحات/التوقف/الترجيح حيث
 * يتوقف عدّاد المباراة أصلًا.
 */
import { useEffect, useRef, useState } from "react";
import type { WcFixture } from "./wcTypes";

type WcStatus = WcFixture["status"];

// الحالات التي يجري فيها عدّاد المباراة فعليًا
const RUNNING_STATUSES = new Set(["1H", "2H", "ET", "LIVE"]);

/**
 * هل عدّاد المباراة يجري فعلًا؟ (شوط لعب لا استراحة/توقف/ترجيح)
 * تستخدمه الواجهات التي تختار بين عرض الدقيقة الحية أو نص الحالة (مثل
 * «استراحة الشوطين») بدل الدقيقة المجمّدة.
 */
export function isClockRunning(status: WcStatus): boolean {
  return RUNNING_STATUSES.has(status.code) && status.elapsed != null;
}

// سقف كل شوط — لا نختلق وقتًا بدل ضائع لا يرسله المزود؛ نتوقف عند الحد حتى
// يؤكد المزود الدقيقة الإضافية أو الانتقال للاستراحة (ثوانٍ قليلة قبل التصحيح)
const HALF_CEILING: Record<string, number> = { "1H": 45, "2H": 90, ET: 120 };

// أقصى دقائق نضيفها محليًا قبل تصحيح الخادم — يحمي من تبويب ظلّ مفتوحًا دون
// تحديث (refetch يتوقف في الخلفية) فلا يقفز الرقم لقيمة شاذة قبل أول تحديث
const MAX_LOCAL_ADD_MIN = 3;

function staticLabel(status: WcStatus): string {
  if (status.elapsed == null) return status.label;
  return status.extra ? `${status.elapsed}+${status.extra}'` : `${status.elapsed}'`;
}

/**
 * نص الدقيقة الحيّة المتقدّمة محليًا. يعيد ضبط المرساة كلما تغيّرت لقطة الخادم
 * (الدقيقة/الوقت الإضافي/الحالة)، ويعدّ كل ثانية أثناء اللعب فقط.
 */
export function useLiveMinute(status: WcStatus): string {
  const running = RUNNING_STATUSES.has(status.code) && status.elapsed != null;

  const anchor = useRef({ elapsed: status.elapsed, extra: status.extra, code: status.code, at: Date.now() });
  const [, force] = useState(0);

  // لقطة خادم جديدة → أعِد ضبط المرساة على رقمها الرسمي
  useEffect(() => {
    anchor.current = { elapsed: status.elapsed, extra: status.extra, code: status.code, at: Date.now() };
    force((n) => n + 1);
  }, [status.elapsed, status.extra, status.code]);

  // عدّاد الثانية يعمل أثناء اللعب فقط
  useEffect(() => {
    if (!running) return;
    const id = setInterval(() => force((n) => n + 1), 1000);
    return () => clearInterval(id);
  }, [running]);

  if (status.elapsed == null) return status.label;
  if (!running) return staticLabel(status);

  const a = anchor.current;
  const added = Math.min(Math.floor((Date.now() - a.at) / 60_000), MAX_LOCAL_ADD_MIN);

  // داخل الوقت بدل الضائع: نزيد على الدقائق الإضافية لا على دقيقة الشوط
  if (a.extra != null) return `${a.elapsed}+${a.extra + added}'`;

  const ceiling = HALF_CEILING[a.code];
  const minute = a.elapsed != null ? a.elapsed + added : added;
  const clamped = ceiling != null && minute > ceiling ? ceiling : minute;
  return `${clamped}'`;
}

/** عرض الدقيقة الحيّة كنص متقدّم محليًا — بديل elapsedLabel في الواجهة الحيّة */
export function LiveMinute({ status }: { status: WcStatus }) {
  return <>{useLiveMinute(status)}</>;
}
