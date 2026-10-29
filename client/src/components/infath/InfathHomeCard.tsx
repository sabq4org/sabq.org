import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { InfathLogo } from "@/components/infath/InfathLogo";
import { apiUrl } from "@/lib/queryClient";
import "@/styles/infath-home-card.css";
import {
  ASSET_FORMS,
  AUCTION_FORMS,
  INFATH_DAY_NAMES,
  arCount,
  auctionPhase,
  auctionStartMs,
  formatSarParts,
  formatTime12,
  formatWeekRange,
  riyadhToday,
  summarizeWeek,
  weekdayOf,
  type InfathPublicView,
} from "@shared/infath";

/**
 * بطاقة مزادات إنفاذ للواجهة: حصاد الأسبوع رقمًا كبيرًا، ثم المبيعات يومًا بيوم،
 * ثم عدّاد أقرب مزاد، وزر إلى /infath. تقرأ JSON الصفحة العام نفسه وتختفي بلا بيانات.
 */

const REGION_FORMS = { one: "منطقة واحدة", two: "منطقتان", few: "مناطق", many: "منطقة" };
const SHORT_DAYS = ["أحد", "اثنين", "ثلاثاء", "أربعاء", "خميس", "جمعة", "سبت"] as const;
const SKYLINE_HEIGHTS = [40, 72, 55, 90, 48, 64, 100, 58, 80, 44, 70, 110, 52, 66, 86, 46, 60, 95, 50, 74, 42, 68, 88, 54];

function useNow(): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 15000);
    return () => window.clearInterval(id);
  }, []);
  return now;
}

function useCountUp(target: number, decimals: number): string {
  const [value, setValue] = useState(target);
  useEffect(() => {
    const reduce = typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (reduce || target <= 0) {
      setValue(target);
      return;
    }
    let frame = 0;
    const start = performance.now();
    const step = (t: number) => {
      const p = Math.min(1, (t - start) / 1100);
      setValue(target * (1 - Math.pow(1 - p, 3)));
      if (p < 1) frame = requestAnimationFrame(step);
    };
    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, [target]);
  return value.toFixed(decimals);
}

/** أفق مبانٍ خافت خلف البطاقة (هوية عقارية). */
function Skyline() {
  const rects: { x: number; w: number; h: number }[] = [];
  for (let x = 0, i = 0; x < 1200; i++) {
    const w = 34 + ((i * 17) % 30);
    rects.push({ x, w, h: SKYLINE_HEIGHTS[i % SKYLINE_HEIGHTS.length] });
    x += w + 6;
  }
  return (
    <svg className="ixh-sky" viewBox="0 0 1200 120" preserveAspectRatio="none" aria-hidden="true">
      <g fill="#EAF4FC">
        {rects.map((r) => <rect key={r.x} x={r.x} y={120 - r.h} width={r.w} height={r.h} rx={3} />)}
      </g>
      <rect x="0" y="117" width="1200" height="3" fill="#DCEBF7" />
    </svg>
  );
}

function InfathHomeCardBody({ view }: { view: InfathPublicView }) {
  const nowMs = useNow();
  const { weekStart, weekEnd, auctions } = view.week;
  const summary = useMemo(() => summarizeWeek(weekStart, auctions), [weekStart, auctions]);
  const today = riyadhToday(new Date(nowMs));
  const finished = today > weekEnd;
  const parts = formatSarParts(summary.soldValue);
  const decimals = parts.value.includes(".") ? parts.value.split(".")[1].length : 0;
  const counted = useCountUp(Number(parts.value), decimals);
  const next = auctions.find((a) => auctionPhase(a, nowMs) === "upcoming") ?? null;
  const live = next ? null : auctions.find((a) => auctionPhase(a, nowMs) === "live") ?? null;
  const maxSold = Math.max(1, ...summary.byDay.map((d) => d.soldValue));
  const maxCount = Math.max(1, ...summary.byDay.map((d) => d.auctions));

  const ms = next ? Math.max(0, auctionStartMs(next.date, next.time) - nowMs) : 0;
  const minutes = Math.floor(ms / 60000);
  const pad = (n: number) => String(n).padStart(2, "0");

  return (
    <section className="ixh" aria-label="مزادات إنفاذ العقارية" dir="rtl">
      <Skyline />
      <div className="ixh-h">
        <div className="ixh-brand">
          <InfathLogo />
          <span className="ixh-sep" />
          <div>
            <h2>المزادات العقارية</h2>
            <p>أسبوع {formatWeekRange(weekStart)}</p>
          </div>
        </div>
        <span className="ixh-live"><i />يتحدث أسبوعيًا</span>
      </div>

      <div className="ixh-b">
        <div>
          <div className="ixh-k">{finished ? "حصاد الأسبوع" : "حصاد هذا الأسبوع حتى الآن"}</div>
          <div className="ixh-big">
            <span className="num">{counted}</span>
            <small>{[parts.unit, "ريال"].filter(Boolean).join(" ")}</small>
          </div>
          <div className="ixh-stats">
            <span><b className="num">{summary.assetsSold}</b> {summary.assetsSold === 1 ? "أصل بيع" : "أصلًا بيعت"}</span>
            <span>نسبة البيع <b className="num">{summary.sellThrough === null ? "—" : `${summary.sellThrough}%`}</b></span>
          </div>
        </div>

        <div>
          <div className="ixh-k">يومًا بيوم</div>
          <div className="ixh-wk">
            {summary.byDay.map((d, i) => {
              const isToday = d.date === today;
              // يوم بلا نتائج بعد (قادم، أو مضى ولم تُدخل نتائجه) يُرسم إطارًا منقطًا بعدد مزاداته.
              const future = d.date > today || d.soldValue === 0;
              const state = d.auctions === 0 ? "off" : isToday ? "now" : future ? "fut" : "";
              const dayParts = formatSarParts(d.soldValue);
              const height = state === "off"
                ? 5
                : state === "fut" || (state === "now" && d.soldValue === 0)
                  ? Math.max(16, (d.auctions / maxCount) * 60)
                  : Math.max(10, (d.soldValue / maxSold) * 84);
              const label = state === "off"
                ? ""
                : d.soldValue > 0
                  ? `${dayParts.value}${dayParts.unit === "مليون" ? " م" : dayParts.unit ? ` ${dayParts.unit}` : ""}`
                  : `${d.auctions} مزاد`;
              return (
                <div key={d.date} className={`ixh-wc ${state}`.trim()}>
                  <span className="v">{label}</span>
                  <span className="b" style={{ height, animationDelay: `${i * 0.1}s` }} />
                  <span className="d">{isToday ? "اليوم" : SHORT_DAYS[weekdayOf(d.date)]}</span>
                </div>
              );
            })}
          </div>
        </div>

        <div>
          <div className="ixh-k">أقرب مزاد</div>
          {next ? (
            <>
              <div className="ixh-nx">{next.city} · {next.assetType} · {arCount(next.assetsCount, ASSET_FORMS)}</div>
              <div className="ixh-cd" aria-live="off">
                <div><b className="num">{Math.floor(minutes / 1440)}</b><small>يوم</small></div>
                <div><b className="num">{pad(Math.floor((minutes % 1440) / 60))}</b><small>ساعة</small></div>
                <div><b className="num">{pad(minutes % 60)}</b><small>دقيقة</small></div>
              </div>
              <div className="ixh-meta">{INFATH_DAY_NAMES[weekdayOf(next.date)]} {formatTime12(next.time)} بتوقيت الرياض</div>
            </>
          ) : live ? (
            <>
              <div className="ixh-nx">{live.city} · {live.assetType} · {arCount(live.assetsCount, ASSET_FORMS)}</div>
              <div className="ixh-meta">جارٍ الآن منذ {formatTime12(live.time)} بتوقيت الرياض، وهو آخر مزادات هذا الأسبوع.</div>
            </>
          ) : (
            <>
              <div className="ixh-nx">لا مزادات قادمة هذا الأسبوع</div>
              <div className="ixh-meta">نعرض مزادات الأسبوع القادم فور اعتمادها.</div>
            </>
          )}
        </div>
      </div>

      <div className="ixh-f">
        <span className="s">
          هذا الأسبوع: {arCount(summary.auctions, AUCTION_FORMS)} · {arCount(summary.assets, ASSET_FORMS)} · {arCount(summary.regions, REGION_FORMS)}
        </span>
        <Link href="/infath" className="ixh-cta">كل المزادات والنتائج ←</Link>
      </div>
    </section>
  );
}

export default function InfathHomeCard() {
  const { data } = useQuery<InfathPublicView | null>({
    queryKey: ["/api/infath", { week: null, preview: null }],
    queryFn: async () => {
      const res = await fetch(apiUrl("/api/infath"), { credentials: "include" });
      if (res.status === 404) return null;
      if (!res.ok) throw new Error(`infath ${res.status}`);
      return (await res.json()) as InfathPublicView;
    },
    retry: 1,
    staleTime: 60_000,
  });
  if (!data?.week) return null;
  return <InfathHomeCardBody view={data} />;
}
