import { X } from "lucide-react";
import { useEffect, useState, type CSSProperties } from "react";

// هوية «عزّنا بطبعنا» — اليوم الوطني السعودي الـ96 (الأربعاء 23 سبتمبر 2026).
// إذا صدرت هوية رسمية جديدة قبل سبتمبر تُستبدل هذه القيم من مكان واحد هنا.
const SADU_GREEN = "#2FA46B";
const GREETING_GRADIENT = "linear-gradient(90deg,#0E4A36,#187653 55%,#0E4A36)";

const DISMISS_KEY = "sabq:nd96-greeting-dismissed:2026";
// نافذة السمة بتوقيت الرياض: ليلة 21 سبتمبر حتى نهاية 25 سبتمبر 2026
const SEASON_FIRST_DAY = "2026-09-21";
const SEASON_LAST_DAY = "2026-09-25";

function isWithinSeasonWindow(now: Date = new Date()): boolean {
  try {
    // en-CA يعطي YYYY-MM-DD فتصلح المقارنة النصية مباشرة
    const ymd = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Riyadh",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(now);
    return ymd >= SEASON_FIRST_DAY && ymd <= SEASON_LAST_DAY;
  } catch {
    return false;
  }
}

/**
 * على نمط useHajjSeason: يكشف هل نحن داخل نافذة اليوم الوطني الـ96،
 * ويتذكر إغلاق شريط التهنئة في localStorage.
 *
 * `?nd96=force` في الرابط (أو تمرير force) يفعّل النافذة خارج موعدها —
 * لمراجعات التصميم ولقطات الـPR.
 */
export function useNationalDay96Season(force = false) {
  const [active, setActive] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    const forced =
      force ||
      (typeof window !== "undefined" &&
        new URLSearchParams(window.location.search).get("nd96") === "force");

    setActive(isWithinSeasonWindow() || forced);
    try {
      setDismissed(window.localStorage.getItem(DISMISS_KEY) === "1");
    } catch {
      // private mode / quota — نتجاهل
    }
  }, [force]);

  const dismiss = () => {
    try {
      window.localStorage.setItem(DISMISS_KEY, "1");
    } catch {
      // ignore
    }
    setDismissed(true);
  };

  const resetDismiss = () => {
    try {
      window.localStorage.removeItem(DISMISS_KEY);
    } catch {
      // ignore
    }
    setDismissed(false);
  };

  return { active, dismissed, dismiss, resetDismiss };
}

/** شريط زخرفة السدو — يوضع أسفل الهيدر مباشرة */
export function NationalDaySaduStrip() {
  return (
    <div
      aria-hidden="true"
      data-testid="nd96-sadu-strip"
      style={{
        height: 8,
        background: `repeating-conic-gradient(${SADU_GREEN} 0% 25%, transparent 0% 50%) 0 0 / 8px 8px`,
        opacity: 0.45,
      }}
    />
  );
}

interface GreetingBarProps {
  /** وضع مُتحكَّم به (صفحة المعاينة) — بدونها يعمل الشريط ذاتيًا حسب الموسم */
  active?: boolean;
  dismissed?: boolean;
  onDismiss?: () => void;
}

/**
 * شريط التهنئة أسفل زخرفة السدو. يُغلق بزر ✕ ويبقى مغلقًا للزائر
 * طوال نافذة الموسم (localStorage).
 */
export function NationalDay96GreetingBar(props: GreetingBarProps) {
  const season = useNationalDay96Season();
  const active = props.active ?? season.active;
  const dismissed = props.dismissed ?? season.dismissed;
  const dismiss = props.onDismiss ?? season.dismiss;

  if (!active || dismissed) return null;

  return (
    <div
      dir="rtl"
      role="region"
      aria-label="تهنئة اليوم الوطني"
      data-testid="nd96-greeting-bar"
      className="relative w-full text-white text-center text-sm font-bold py-2 px-10"
      style={{ background: GREETING_GRADIENT }}
    >
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "repeating-conic-gradient(rgba(255,255,255,.06) 0% 25%, transparent 0% 50%) 0 0 / 10px 10px",
        }}
      />
      <span className="relative">
        عزّنا بطبعنا — تغطية خاصة لليوم الوطني السعودي الـ96
      </span>
      <button
        type="button"
        onClick={dismiss}
        aria-label="إخفاء رسالة التهنئة"
        data-testid="button-dismiss-nd96-greeting"
        className="absolute top-1/2 -translate-y-1/2 left-2 z-10 inline-flex items-center justify-center rounded-full p-1 text-white/90 hover:bg-white/20 focus:outline-none focus:ring-2 focus:ring-white/60"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}

/** فئة نطاق السمة — تُضاف على الحاوية الملتفّة حول الهيدر مع ND96_SCOPE_STYLE */
export const ND96_SCOPE_CLASS = "nd96-scope";

/**
 * لمسات لا تُضبط بمتغيرات الألوان وحدها، تسري داخل النطاق فقط:
 * شعار سبق بنسخة بيضاء (قلب لوني كامل)، وإخفاء شعار كأس الملك —
 * الهوية الوطنية وحدها في الهيدر أيام المناسبة.
 */
export function NationalDay96ScopeStyles() {
  return (
    <style>{`
      .${ND96_SCOPE_CLASS} img[alt="سبق - SABQ"] { filter: brightness(0) invert(1); }
      .${ND96_SCOPE_CLASS} [data-testid="link-kings-cup-header"],
      .${ND96_SCOPE_CLASS} [data-testid="link-kings-cup-header-mobile"] { display: none; }
    `}</style>
  );
}

/**
 * تجاوزات ألوان الهوية (HSL triplets بصيغة متغيرات shadcn) تُطبَّق على
 * الحاوية الملتفّة حول الهيدر فقط، فيلبس الهيدر الأخضر الداكن في الوضعين
 * الفاتح والداكن — الهوية ليلية بطبيعتها عمدًا.
 *
 * ملاحظة: القوائم المنبثقة (بحث/حساب) تُرسم في Portal خارج هذا النطاق
 * فتحتفظ بألوان الموقع الافتراضية.
 */
export const ND96_SCOPE_STYLE = {
  // خلفية صلبة تحت الهيدر: خلفيته bg-background/60 مع blur، وبدون طبقة صلبة
  // خلفه يغسله بياضُ الصفحة. ولون نص افتراضي كي ترث الأيقونات الفاتح لا لون body.
  backgroundColor: "hsl(168 74% 8%)",
  color: "hsl(142 29% 95%)",
  "--background": "168 74% 8%", // #05221C تقريبًا
  "--foreground": "142 29% 95%", // #EDF5F0
  "--border": "167 55% 20%", // #175044
  "--card": "168 63% 11%", // #0A2C25
  "--card-foreground": "142 29% 95%",
  "--card-border": "167 55% 20%",
  "--popover": "168 63% 11%",
  "--popover-foreground": "142 29% 95%",
  "--popover-border": "167 55% 20%",
  "--muted": "168 55% 14%",
  "--muted-foreground": "158 19% 67%", // #9CBCB0
  "--primary": "150 55% 59%", // #5BD095
  "--primary-foreground": "169 77% 7%", // #041F1A
  "--accent": "167 55% 16%",
  "--accent-foreground": "150 55% 59%",
  "--elevate-1": "rgba(255,255,255,.04)",
  "--elevate-2": "rgba(255,255,255,.09)",
} as CSSProperties;
