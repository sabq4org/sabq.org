/**
 * هوية سبق سبورت المشتركة — دليل الهوية البصرية v1.0 (SABQ Brand Guidelines).
 *
 * تجمع كل ما تحتاجه صفحات سبق سبورت لتلبس الهوية دون تكرار:
 *   - BRAND_CSS: تجاوز توكنز الثيم داخل نطاق .sbq-sport (فاتح + داكن «حبري»)
 *     فتكتسب المكوّنات المعاد استخدامها ألوان الدليل تلقائيًا دون تفريع.
 *   - useBrandFonts: تحميل كسول لخطوط الدليل (Alexandria + IBM Plex Mono).
 *   - RisingBars: موتيف «الأعمدة الصاعدة» من الشعار — التوقيع الرسومي.
 *   - SectionHead / brandMoreLink: ترويسات الأقسام بنمط الدليل.
 *
 * الاستخدام: غلّف محتوى الصفحة بـ <div className="sbq-sport"> وضع داخله
 * <style>{BRAND_CSS}</style> واستدعِ useBrandFonts() في المكوّن.
 */
import { useEffect } from "react";
import { Link } from "wouter";
import { ChevronLeft } from "lucide-react";

// الفاتح: أبيض + #F4F8FB، نص كحلي #10202E، حدود #E3EBF2، أزرق عميق للنص.
// الداكن: «الوضع الحبري» — أسطح كحلي الحبر #0E2233 بدل الرمادي المحايد.
export const BRAND_CSS = `
.sbq-sport{
  --background:0 0% 100%;
  --foreground:208 48% 12%;
  --card:0 0% 100%;
  --card-foreground:208 48% 12%;
  --card-border:208 37% 92%;
  --popover:0 0% 100%;
  --popover-foreground:208 48% 12%;
  --border:208 37% 92%;
  --input:206 32% 85%;
  --primary:203 86% 39%;
  --primary-foreground:0 0% 100%;
  --secondary:206 47% 97%;
  --secondary-foreground:208 48% 12%;
  --muted:206 47% 97%;
  --muted-foreground:207 15% 41%;
  --accent:203 94% 93%;
  --accent-foreground:203 86% 39%;
  --accent-blue:203 94% 93%;
  --destructive:0 65% 61%;
  --destructive-foreground:0 0% 100%;
  --ring:202 98% 65%;
}
.dark .sbq-sport{
  --background:208 60% 8%;
  --foreground:205 50% 93%;
  --card:208 57% 13%;
  --card-foreground:205 50% 93%;
  --card-border:208 45% 20%;
  --popover:208 57% 13%;
  --popover-foreground:205 50% 93%;
  --border:208 45% 20%;
  --input:208 40% 26%;
  --primary:202 98% 65%;
  --primary-foreground:208 57% 13%;
  --secondary:208 50% 16%;
  --secondary-foreground:205 50% 93%;
  --muted:208 50% 16%;
  --muted-foreground:206 22% 63%;
  --accent:207 55% 18%;
  --accent-foreground:202 98% 65%;
  --accent-blue:207 55% 22%;
  --destructive:0 65% 61%;
  --destructive-foreground:0 0% 100%;
  --ring:202 98% 65%;
}
.sbq-display{font-family:'Alexandria','Tajawal','IBM Plex Sans Arabic',sans-serif;}
/* Plex Mono للاتيني والأرقام؛ العربية تسقط إلى Plex Arabic (كما يمزج الدليل) */
.sbq-mono{font-family:'IBM Plex Mono','JetBrains Mono','IBM Plex Sans Arabic',monospace;font-variant-numeric:tabular-nums;}
.sbq-ink{background:#0E2233;}
.sbq-shadow-1{box-shadow:0 1px 3px rgba(14,34,51,.10);}
.sbq-card-hover{transition:box-shadow .25s ease,border-color .25s ease;}
.sbq-card-hover:hover{box-shadow:0 8px 24px rgba(14,34,51,.12);}
.sbq-eyebrow{font-family:'IBM Plex Mono','JetBrains Mono',monospace;font-size:12px;letter-spacing:2px;color:#0E76B8;}
.dark .sbq-sport .sbq-eyebrow{color:#4CBCFD;}
.sbq-action{background:#4CBCFD;color:#fff;transition:background-color .2s ease;}
.sbq-action:hover{background:#0E76B8;}
.sbq-hero-overlay{background:linear-gradient(to top,rgba(14,34,51,.94) 0%,rgba(14,34,51,.42) 55%,rgba(14,34,51,.05) 100%);}
@keyframes sbq-rise{from{transform:scaleY(0);}to{transform:scaleY(1);}}
.sbq-bar{transform-origin:bottom;animation:sbq-rise .9s cubic-bezier(.22,.7,.3,1) both;}
@media (prefers-reduced-motion:reduce){.sbq-bar{animation:none;}}
`;

// خطوط الهوية (Alexandria للعناوين + IBM Plex Mono للأرقام + أوزان Plex Arabic
// الوسطى) — تُحمَّل عند أول زيارة لصفحة رياضية فقط كي لا تُثقل باقي الموقع.
export function useBrandFonts() {
  useEffect(() => {
    if (document.getElementById("sbq-sport-fonts")) return;
    const link = document.createElement("link");
    link.id = "sbq-sport-fonts";
    link.rel = "stylesheet";
    link.href =
      "https://fonts.googleapis.com/css2?family=Alexandria:wght@500;700;800&family=IBM+Plex+Mono:wght@400;500&family=IBM+Plex+Sans+Arabic:wght@500;600&display=swap";
    document.head.appendChild(link);
    // لا نزيله عند المغادرة — الخط صار في الكاش وإزالته تسبّب وميضًا عند العودة.
  }, []);
}

// موتيف «الأعمدة الصاعدة» من الشعار — تُقرأ صاعدةً من اليسار لليمين (dir=ltr).
export function RisingBars({
  className = "",
  bars = [44, 72, 104, 140, 84],
  width = 20,
  gap = 8,
  colors = ["#4CBCFD"],
  radius = 8,
}: {
  className?: string;
  bars?: number[];
  width?: number;
  gap?: number;
  colors?: string[];
  radius?: number;
}) {
  return (
    <div dir="ltr" aria-hidden="true" className={`pointer-events-none flex items-end ${className}`} style={{ gap }}>
      {bars.map((h, i) => (
        <div
          key={i}
          className="sbq-bar"
          style={{
            width,
            height: h,
            background: colors[i % colors.length],
            borderRadius: `${radius}px ${radius}px 0 0`,
            animationDelay: `${i * 90}ms`,
          }}
        />
      ))}
    </div>
  );
}

// ترويسة قسم بنمط الدليل: eyebrow أحادي المسافة + عنوان Alexandria + وصف.
export function SectionHead({
  en,
  title,
  subtitle,
  action,
}: {
  en: string;
  title: string;
  subtitle?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="mb-7 flex flex-wrap items-end justify-between gap-4">
      <div>
        <div className="mb-2"><span dir="ltr" className="sbq-eyebrow">{en}</span></div>
        <h2 className="sbq-display text-2xl font-bold leading-tight text-foreground sm:text-[32px]">{title}</h2>
        {subtitle && <p className="mt-1.5 text-sm text-muted-foreground">{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}

export const brandMoreLink = (href: string, label = "المزيد") => (
  <Link href={href} className="inline-flex items-center gap-1 text-sm font-bold text-accent-foreground transition-colors hover:text-foreground">
    {label} <ChevronLeft className="h-4 w-4" strokeWidth={1.8} />
  </Link>
);
