/**
 * بلوك الرئيسية «أين أنفق السعوديون أموالهم هذا الأسبوع؟»
 * للقارئ العادي: لا دولار ولا تضخم — إجمالي الإنفاق الأسبوعي عبر نقاط البيع وأكبر القطاعات
 * بحصّتها وتغيّرها، من تقرير البنك المركزي. يختفي ذاتيًا (null) بلا تقرير.
 *
 * على شاشات الهاتف (أقل من 768px) يُعرض كبطاقة واحدة برقم واحد — نظير
 * `EconomyHomeBlock.swift` في تطبيق iOS: الإجمالي الأسبوعي (أو أول رقم من النشرة
 * الشهرية الجديدة) مع الفترة والمصدر ورابط «أين صُرفت؟». الشبكة الكاملة تبقى للحاسوب.
 */
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { useIsMobile } from "@/hooks/use-mobile";
import {
  Briefcase, Cake, Car, ChevronLeft, Fuel, Gem, GraduationCap, Hotel, Landmark, Plane, Shirt, ShoppingBasket, Smartphone, Sofa, Stethoscope, Ticket, Utensils, Wrench, Zap, type LucideIcon,
} from "lucide-react";
import { ChangeChip } from "./ChangeChip";
import { fmtCount, fmtPct, fmtSar, isFresh } from "./format";
import { NewBadge } from "./NewBadge";
import type { EconomySnapshot } from "./types";
import { MonthlyCardView } from "./MonthlyModule";

const ICONS: Record<string, LucideIcon> = {
  "Restaurants & Cafés": Utensils,
  "Food & Beverages": ShoppingBasket,
  "Apparel, Clothing & Accessories": Shirt,
  "Gas Stations": Fuel,
  "Medical Services": Stethoscope,
  "Pharmacies & Medical Supplies": Stethoscope,
  "Furniture & Home Supplies": Sofa,
  "Electronic & Electric Devices": Smartphone,
  "Professional & Business Services": Briefcase,
  Education: GraduationCap,
  Hotels: Hotel,
  Airlines: Plane,
  "Trade of Vehicles & Spare Parts": Car,
  "Maintenance & Repair of Vehicles": Wrench,
  Jewelry: Gem,
  "Bakeries & Pastries": Cake,
  Recreation: Ticket,
  "Public Utilities & Services": Zap,
};

/**
 * بطاقة الهاتف: عنوان قصير + شارة الحداثة، رقم واحد كبير، الفترة، ثم المصدر ورابط التفاصيل.
 * البطاقة كلها رابط إلى /economy، بحد علوي بلون الهوية ينحني مع الزوايا كما في التطبيق.
 */
function EconomyHomeTeaser({ title, figure, unit, caption, badge, cta, ariaLabel }: {
  title: string; figure: string; unit?: string; caption: string; badge: string | null; cta: string; ariaLabel: string;
}) {
  return (
    <section className="py-2" aria-label={ariaLabel} data-testid="economy-home-block">
      <Link
        href="/economy"
        className="block rounded-2xl border border-card-border border-t-[3px] border-t-primary bg-card p-3.5 transition-colors hover:border-primary/60"
        data-testid="economy-home-teaser"
        aria-label={`${title}: ${figure}${unit ? ` ${unit}` : ""} — عرض تفاصيل الاقتصاد بالقطاعات والمدن`}
      >
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-[14px] font-bold leading-snug text-foreground">{title}</h2>
          {badge && <NewBadge label={badge} />}
        </div>
        <div className="mt-2 text-[32px] font-black leading-none tabular-nums text-primary truncate" data-testid="economy-home-figure">
          {figure}{unit && <span className="mr-1.5 text-base font-bold">{unit}</span>}
        </div>
        <p className="mt-2 text-[11px] leading-snug text-muted-foreground">{caption}</p>
        <div className="mt-2 flex items-baseline justify-between gap-2">
          <span className="text-[10px] text-muted-foreground">المصدر: البنك المركزي السعودي</span>
          <span className="inline-flex shrink-0 items-center gap-1 text-[11px] font-bold text-primary">
            {cta} <ChevronLeft className="h-3 w-3" aria-hidden="true" />
          </span>
        </div>
      </Link>
    </section>
  );
}

export function EconomyNumbersBlock() {
  const { data } = useQuery<EconomySnapshot | null>({ queryKey: ["/api/economy/snapshot"], staleTime: 5 * 60_000, refetchInterval: 10 * 60_000 });
  const isMobile = useIsMobile();
  const w = data?.weekly;
  const m = data?.monthly;

  // نشرة شهرية جديدة (48 ساعة) → البلوك يتحول إلى «السعوديون في شهر»
  if (m && isFresh(m.ingestedAt) && m.cards.length >= 3) {
    if (isMobile) {
      // الهاتف: أول رقم من ترتيب الخادم بدل شبكة البطاقات (حصة الجوال تحتفظ بمعنى النسبة)
      const card = m.cards[0];
      return (
        <EconomyHomeTeaser
          title={`رقم من ${m.monthLabelAr}`}
          figure={card.figure}
          caption={card.key === "mobileVsCard" ? "من إنفاق نقاط البيع تم بالجوال" : (card.seriesLabelAr || card.cardTitle)}
          badge="نشرة جديدة"
          cta="أرقام الشهر"
          ariaLabel={`السعوديون في ${m.monthLabelAr} بالأرقام`}
        />
      );
    }
    return (
      <section className="py-2" aria-label={`السعوديون في ${m.monthLabelAr} بالأرقام`} data-testid="economy-home-block">
        <div className="rounded-2xl border border-card-border bg-card p-4 sm:p-5">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <div className="flex items-center gap-2 text-[11px] font-semibold text-primary">
                <Landmark className="h-3.5 w-3.5" aria-hidden="true" />
                النشرة الإحصائية الشهرية · البنك المركزي السعودي
                <NewBadge label="نشرة جديدة" />
              </div>
              <h2 className="mt-1 text-xl sm:text-2xl font-extrabold leading-snug [text-wrap:balance]">السعوديون في {m.monthLabelAr} بالأرقام</h2>
              <p className="mt-1 text-sm text-muted-foreground">{m.headline}</p>
            </div>
            <Link href="/economy" className="inline-flex items-center gap-1 rounded-full bg-primary px-4 py-2 text-[13px] font-bold text-primary-foreground transition-opacity hover:opacity-90">
              كل أرقام الشهر <ChevronLeft className="h-3.5 w-3.5" aria-hidden="true" />
            </Link>
          </div>
          <div className="mt-4 grid gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
            {m.cards.slice(0, 6).map((c) => <MonthlyCardView key={c.key} c={{ ...c, series: [] }} compact />)}
          </div>
        </div>
      </section>
    );
  }

  if (!w || !w.topSectors?.length) return null;

  if (isMobile) {
    return (
      <EconomyHomeTeaser
        title="أين أنفق السعوديون؟"
        figure={fmtSar(w.totalValue)}
        unit="ريال"
        caption={`إنفاق نقاط البيع · ${w.weekLabelAr}`}
        badge={isFresh(w.ingestedAt) ? "أرقام جديدة" : null}
        cta="أين صُرفت؟"
        ariaLabel="أين أنفق السعوديون أموالهم هذا الأسبوع"
      />
    );
  }

  const top = w.topSectors.slice(0, 5);

  return (
    <section className="py-2" aria-label="أين أنفق السعوديون أموالهم هذا الأسبوع" data-testid="economy-home-block">
      <div className="rounded-2xl border border-card-border bg-card p-4 sm:p-5">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <div className="flex items-center gap-2 text-[11px] font-semibold text-primary">
              <Landmark className="h-3.5 w-3.5" aria-hidden="true" />
              بيانات البنك المركزي السعودي · الأسبوع {w.weekLabelAr}
              {isFresh(w.ingestedAt) && <NewBadge label="أرقام جديدة" />}
            </div>
            <h2 className="mt-1 text-xl sm:text-2xl font-extrabold leading-snug [text-wrap:balance]">أين أنفق السعوديون أموالهم هذا الأسبوع؟</h2>
            <p className="mt-1 text-sm text-muted-foreground">{w.headline}</p>
          </div>
          <Link href="/economy" className="inline-flex items-center gap-1 rounded-full bg-primary px-4 py-2 text-[13px] font-bold text-primary-foreground transition-opacity hover:opacity-90">
            التفاصيل بالقطاعات والمدن <ChevronLeft className="h-3.5 w-3.5" aria-hidden="true" />
          </Link>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-6">
          <Link href="/economy" className="col-span-2 sm:col-span-1 rounded-xl bg-primary px-3.5 py-3 text-primary-foreground hover:opacity-95" data-testid="economy-home-total">
            <div className="text-[11px] opacity-90">إجمالي الإنفاق في أسبوع</div>
            <div className="mt-0.5 text-2xl font-extrabold tabular-nums leading-tight">{fmtSar(w.totalValue)}<span className="text-xs font-semibold mr-1 opacity-90">ريال</span></div>
            <div className="mt-1 flex items-center justify-between gap-2 text-[11px] opacity-90">
              <span>{fmtCount(w.totalCount)} عملية</span>
              <span dir="ltr" className="font-semibold">{w.totalChangePct >= 0 ? "▲" : "▼"} {fmtPct(w.totalChangePct)}</span>
            </div>
          </Link>
          {top.map((s) => {
            const Icon = ICONS[s.en] ?? ShoppingBasket;
            return (
              <Link key={s.en} href="/economy" className="rounded-xl border border-border bg-background px-3 py-2.5 hover:border-primary/60" data-testid={`economy-home-sector-${s.en}`}>
                <div className="flex items-center justify-between gap-2">
                  <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary/10 text-primary"><Icon className="h-4 w-4" aria-hidden="true" /></span>
                  <ChangeChip value={s.changePct} />
                </div>
                <div className="mt-2 text-[13px] font-bold leading-tight truncate" title={s.ar}>{s.ar}</div>
                <div className="mt-0.5 text-[11px] text-muted-foreground tabular-nums">{fmtSar(s.value)} ريال · {fmtPct(s.share, 0)} من الإنفاق</div>
              </Link>
            );
          })}
        </div>
      </div>
    </section>
  );
}

export default EconomyNumbersBlock;
