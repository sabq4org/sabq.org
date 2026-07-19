/**
 * مسودة تقرير كأس العالم 2026 بالأرقام — داخلية فقط، للمراجعة قبل النشر.
 */
import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { DashboardLayout } from "@/components/DashboardLayout";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { apiUrl } from "@/lib/queryClient";
import { cn } from "@/lib/utils";
import {
  Trophy,
  Newspaper,
  Sparkles,
  Eye,
  Goal,
  RectangleVertical,
  Flag,
  Activity,
  ExternalLink,
  RefreshCw,
  Crown,
  ChevronLeft,
  ChevronRight,
  Layers,
} from "lucide-react";

type Report = {
  status: "draft" | "published";
  generatedAt: string;
  headline: string;
  subtitle: string;
  sabq: {
    totalArticles: number;
    aiGenerated: number;
    editorial: number;
    previews: number;
    matchReports: number;
    infographics: number;
    analyses: number;
    opinions: number;
    totalViews: number;
    avgViews: number;
    breakdown: { matchDesk: number; editorialWindow: number };
    methodology: string[];
    topArticles: Array<{
      id: string;
      title: string;
      slug: string;
      englishSlug: string | null;
      views: number;
      articleType: string | null;
      aiGenerated: boolean | null;
      imageUrl: string | null;
    }>;
    dailyPulse: Array<{ day: string; count: number; views: number }>;
  };
  tournament: {
    configured: boolean;
    totalFixtures: number;
    finished: number;
    live: number;
    upcoming: number;
    totalGoals: number;
    avgGoalsPerMatch: number;
    penaltyShootouts: number;
    champion: {
      team: { id: number; name: string; logo: string };
      runnerUp: { name: string; logo: string } | null;
      score: string | null;
      penalties: string | null;
    } | null;
    topScorers: Array<{ name: string; team: string; goals: number; assists: number }>;
    topAssists: Array<{ name: string; team: string; assists: number }>;
    cards: {
      yellowOnBoard: number;
      redOnBoard: number;
      leaders: Array<{ name: string; team: string; yellow: number; red: number }>;
    };
    arab: { matchesPlayed: number; goalsFor: number; goalsAgainst: number };
  };
  platform: Array<{ id: string; title: string; description: string; href?: string }>;
  storyBeats: Array<{
    label: string;
    value: string;
    numericValue: number | null;
    detail: string;
  }>;
};

type TabId = "pulse" | "sabq" | "pitch" | "platform";

function useCountUp(target: number, duration = 900) {
  const [value, setValue] = useState(0);
  useEffect(() => {
    let raf = 0;
    const start = performance.now();
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - t, 3);
      setValue(Math.round(target * eased));
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, duration]);
  return value;
}

function StatOrb({
  label,
  value,
  numericValue,
  hint,
  accent,
  active,
  onSelect,
}: {
  label: string;
  value: number | string;
  numericValue?: number | null;
  hint?: string;
  accent: string;
  active?: boolean;
  onSelect?: () => void;
}) {
  const numeric =
    numericValue != null
      ? numericValue
      : typeof value === "number"
        ? value
        : null;
  const animated = useCountUp(numeric ?? 0);
  const display =
    numeric != null ? animated.toLocaleString("en-US") : String(value);

  const inner = (
    <>
      <div
        className="pointer-events-none absolute -left-6 -top-6 h-16 w-16 rounded-full opacity-25 blur-xl transition group-hover:opacity-45 sm:-left-8 sm:-top-8 sm:h-28 sm:w-28 sm:opacity-30 sm:blur-2xl"
        style={{ background: accent }}
      />
      <p className="line-clamp-2 text-[10px] leading-snug text-white/60 sm:text-xs">{label}</p>
      <p className="mt-1.5 text-xl font-black tracking-tight text-white sm:mt-2 sm:text-3xl md:text-4xl">
        {display}
      </p>
      {hint ? (
        <p className="mt-1 line-clamp-2 text-[10px] leading-snug text-white/50 sm:mt-2 sm:text-xs">
          {hint}
        </p>
      ) : null}
    </>
  );

  const className = cn(
    "group relative min-w-0 overflow-hidden rounded-2xl border bg-white/5 p-3 backdrop-blur-md transition sm:rounded-3xl sm:p-5",
    active
      ? "border-amber-300/50 bg-white/10 ring-1 ring-amber-300/30"
      : "border-white/10 hover:border-white/25 hover:bg-white/10",
    onSelect && "cursor-pointer text-right",
  );

  if (onSelect) {
    return (
      <button type="button" onClick={onSelect} className={className} style={{ ["--orb" as string]: accent }}>
        {inner}
      </button>
    );
  }

  return (
    <div className={className} style={{ ["--orb" as string]: accent }}>
      {inner}
    </div>
  );
}

function MixMeter({ ai, editorial }: { ai: number; editorial: number }) {
  const total = Math.max(1, ai + editorial);
  const aiPct = Math.round((ai / total) * 100);
  const edPct = 100 - aiPct;
  return (
    <div className="rounded-3xl border border-white/10 bg-black/20 p-5">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 className="text-lg font-bold text-white">مزيج التغطية</h2>
        <Layers className="h-4 w-4 text-amber-300" />
      </div>
      <div className="flex h-3 overflow-hidden rounded-full bg-white/10">
        <div
          className="bg-gradient-to-l from-emerald-400 to-teal-500 transition-all duration-700"
          style={{ width: `${aiPct}%` }}
          title={`AI ${aiPct}%`}
        />
        <div
          className="bg-gradient-to-l from-amber-300 to-orange-500 transition-all duration-700"
          style={{ width: `${edPct}%` }}
          title={`تحريري ${edPct}%`}
        />
      </div>
      <div className="mt-3 flex justify-between text-xs text-white/65">
        <span>
          AI · <strong className="text-emerald-300">{ai.toLocaleString("en-US")}</strong> ({aiPct}%)
        </span>
        <span>
          تحريري · <strong className="text-amber-300">{editorial.toLocaleString("en-US")}</strong> ({edPct}%)
        </span>
      </div>
    </div>
  );
}

function PulseChart({
  days,
  selectedDay,
  onSelectDay,
}: {
  days: Report["sabq"]["dailyPulse"];
  selectedDay: string | null;
  onSelectDay: (day: string | null) => void;
}) {
  const max = Math.max(1, ...days.map((d) => d.count));
  const recent = days.slice(-28);
  if (recent.length === 0) {
    return <p className="text-sm text-white/50">لا بيانات يومية بعد</p>;
  }
  const selected = selectedDay ? recent.find((d) => d.day === selectedDay) : null;
  return (
    <div className="space-y-3">
      <div className="flex h-44 items-end gap-1">
        {recent.map((d) => {
          const active = selectedDay === d.day;
          return (
            <button
              key={d.day}
              type="button"
              onClick={() => onSelectDay(active ? null : d.day)}
              className="group flex flex-1 flex-col items-center gap-1 outline-none"
              title={`${d.day}: ${d.count} مادة · ${d.views} مشاهدة`}
            >
              <div
                className={cn(
                  "w-full rounded-t-md transition",
                  active
                    ? "bg-gradient-to-t from-amber-500 to-amber-200 shadow-[0_0_12px_rgba(251,191,36,0.45)]"
                    : "bg-gradient-to-t from-amber-600/40 to-amber-300/70 group-hover:to-amber-200",
                )}
                style={{ height: `${Math.max(8, (d.count / max) * 100)}%` }}
              />
              <span className="hidden text-[9px] text-white/40 sm:block">
                {d.day.slice(5)}
              </span>
            </button>
          );
        })}
      </div>
      {selected ? (
        <div className="rounded-2xl border border-amber-300/20 bg-amber-400/10 px-4 py-3 text-sm text-amber-50">
          <strong>{selected.day}</strong>
          {" · "}
          {selected.count.toLocaleString("en-US")} مادة
          {" · "}
          {selected.views.toLocaleString("en-US")} مشاهدة
          <button
            type="button"
            className="mr-3 text-amber-200/80 underline-offset-2 hover:underline"
            onClick={() => onSelectDay(null)}
          >
            إلغاء التحديد
          </button>
        </div>
      ) : (
        <p className="text-xs text-white/40">انقر يوماً لرؤية تفاصيل النبض</p>
      )}
    </div>
  );
}

function StoryRail({
  beats,
  index,
  onChange,
}: {
  beats: Report["storyBeats"];
  index: number;
  onChange: (i: number) => void;
}) {
  if (beats.length === 0) return null;
  const beat = beats[Math.min(index, beats.length - 1)]!;
  return (
    <div className="rounded-3xl border border-white/10 bg-gradient-to-l from-red-950/40 via-black/20 to-amber-950/30 p-5">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div>
          <p className="text-xs text-amber-200/70">حكاية الأرقام · فصل {index + 1}/{beats.length}</p>
          <h2 className="text-xl font-black text-white">{beat.label}</h2>
        </div>
        <div className="flex gap-1">
          <Button
            size="icon"
            variant="outline"
            className="h-8 w-8 border-white/20 bg-white/5 text-white hover:bg-white/10"
            onClick={() => onChange((index - 1 + beats.length) % beats.length)}
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
          <Button
            size="icon"
            variant="outline"
            className="h-8 w-8 border-white/20 bg-white/5 text-white hover:bg-white/10"
            onClick={() => onChange((index + 1) % beats.length)}
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
        </div>
      </div>
      <p className="text-4xl font-black text-amber-200 md:text-5xl">{beat.value}</p>
      <p className="mt-2 text-sm text-white/65">{beat.detail}</p>
      <div className="mt-4 flex gap-1.5">
        {beats.map((_, i) => (
          <button
            key={i}
            type="button"
            aria-label={`فصل ${i + 1}`}
            onClick={() => onChange(i)}
            className={cn(
              "h-1.5 flex-1 rounded-full transition",
              i === index ? "bg-amber-300" : "bg-white/15 hover:bg-white/30",
            )}
          />
        ))}
      </div>
    </div>
  );
}

export default function Wc2026NumbersReportPage() {
  const [tab, setTab] = useState<TabId>("pulse");
  const [selectedDay, setSelectedDay] = useState<string | null>(null);
  const [storyIndex, setStoryIndex] = useState(0);
  const [focusBeat, setFocusBeat] = useState<number | null>(null);

  const { data, isLoading, isFetching, refetch, error } = useQuery<Report>({
    queryKey: ["/api/admin/wc-2026-numbers-report"],
    queryFn: async () => {
      const res = await fetch(apiUrl("/api/admin/wc-2026-numbers-report"), {
        credentials: "include",
      });
      if (!res.ok) {
        let detail = "";
        try {
          const body = (await res.json()) as { message?: string; detail?: string; required?: string };
          detail = [body.message, body.detail, body.required ? `مطلوب: ${body.required}` : ""]
            .filter(Boolean)
            .join(" — ");
        } catch {
          /* ignore */
        }
        throw new Error(detail || `فشل تحميل التقرير (HTTP ${res.status})`);
      }
      return res.json();
    },
    staleTime: 60_000,
    retry: 1,
  });

  const tabs = useMemo(
    () =>
      [
        { id: "pulse" as const, label: "نبض اللحظة", icon: Activity },
        { id: "sabq" as const, label: "سبق كانت حاضرة", icon: Newspaper },
        { id: "pitch" as const, label: "الملعب بالأرقام", icon: Goal },
        { id: "platform" as const, label: "مميزات المنصة", icon: Sparkles },
      ] as const,
    [],
  );

  const champ = data?.tournament.champion;

  useEffect(() => {
    if (!data?.storyBeats.length) return;
    const id = window.setInterval(() => {
      setStoryIndex((i) => (i + 1) % data.storyBeats.length);
    }, 4500);
    return () => window.clearInterval(id);
  }, [data?.storyBeats.length]);

  return (
    <DashboardLayout>
      <div className="mx-auto w-full max-w-[1600px] px-4 pb-12 sm:px-6" dir="rtl">
        <div
          className="relative overflow-hidden rounded-[2rem] border border-amber-400/20 shadow-2xl"
          style={{
            background:
              "radial-gradient(ellipse at 20% 0%, #3b1d0f 0%, #0a0f1c 45%, #05070d 100%)",
          }}
        >
          <div
            className="pointer-events-none absolute inset-0 opacity-[0.07]"
            style={{
              backgroundImage:
                "url(\"data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%23fbbf24' fill-opacity='0.4'%3E%3Cpath d='M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E\")",
            }}
          />
          <div
            className="pointer-events-none absolute -left-6 top-16 rotate-[-18deg] select-none text-6xl font-black tracking-[0.2em] text-amber-400/10 md:text-8xl"
            aria-hidden
          >
            DRAFT
          </div>

          <div className="relative space-y-6 p-5 sm:p-8">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="max-w-3xl space-y-3">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge className="bg-amber-400 text-amber-950 hover:bg-amber-400">
                    مسودة — غير منشورة للعامة
                  </Badge>
                  <Badge variant="outline" className="border-white/20 text-white/70">
                    WC 2026 Numbers
                  </Badge>
                  <Badge variant="outline" className="border-emerald-400/30 text-emerald-200/80">
                    داخل لوحة التحكم فقط
                  </Badge>
                </div>
                <h1 className="text-3xl font-black leading-tight text-white md:text-5xl">
                  {data?.headline || "كأس العالم 2026 بالأرقام"}
                </h1>
                <p className="text-sm text-white/65 md:text-base">
                  {data?.subtitle ||
                    "راجع الأرقام هنا قبل أي نشر. الصفحة العامة لن تُفعَّل إلا بأمرك."}
                </p>
              </div>

              <div className="flex flex-col items-end gap-2">
                <Button
                  variant="outline"
                  className="border-white/20 bg-white/5 text-white hover:bg-white/10"
                  onClick={() => refetch()}
                  disabled={isFetching}
                >
                  <RefreshCw className={cn("ml-2 h-4 w-4", isFetching && "animate-spin")} />
                  تحديث الأرقام
                </Button>
                {data?.generatedAt ? (
                  <p className="text-[11px] text-white/40">
                    آخر توليد: {new Date(data.generatedAt).toLocaleString("ar-SA")}
                  </p>
                ) : null}
              </div>
            </div>

            {champ ? (
              <div className="relative flex flex-wrap items-center gap-4 overflow-hidden rounded-2xl border border-amber-300/30 bg-gradient-to-l from-amber-500/20 via-red-600/10 to-transparent p-4">
                <div className="pointer-events-none absolute inset-y-0 left-0 w-1/3 animate-pulse bg-gradient-to-r from-amber-300/10 to-transparent" />
                <div className="flex h-14 w-14 items-center justify-center rounded-full bg-amber-400/20 ring-2 ring-amber-300/40">
                  {champ.team.logo ? (
                    <img src={champ.team.logo} alt="" className="h-10 w-10 object-contain" />
                  ) : (
                    <Crown className="h-7 w-7 text-amber-300" />
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-xs text-amber-200/80">بطل كأس العالم 2026</p>
                  <p className="text-2xl font-black text-white">{champ.team.name}</p>
                  <p className="text-sm text-white/60">
                    {champ.runnerUp ? `على حساب ${champ.runnerUp.name}` : ""}
                    {champ.score ? ` · ${champ.score}` : ""}
                    {champ.penalties ? ` (ركلات ${champ.penalties})` : ""}
                  </p>
                </div>
                <Trophy className="h-10 w-10 text-amber-300/80" />
              </div>
            ) : null}

            <div className="flex flex-wrap gap-2">
              {tabs.map((t) => {
                const Icon = t.icon;
                const active = tab === t.id;
                return (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => setTab(t.id)}
                    className={cn(
                      "inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm transition",
                      active
                        ? "bg-amber-400 text-amber-950 shadow-lg shadow-amber-500/20"
                        : "bg-white/5 text-white/70 hover:bg-white/10 hover:text-white",
                    )}
                  >
                    <Icon className="h-4 w-4" />
                    {t.label}
                  </button>
                );
              })}
            </div>

            {isLoading ? (
              <div className="grid grid-cols-2 gap-2 sm:gap-3 xl:grid-cols-4">
                {[1, 2, 3, 4].map((i) => (
                  <Skeleton key={i} className="h-20 rounded-2xl bg-white/10 sm:h-28 sm:rounded-3xl" />
                ))}
              </div>
            ) : error || !data ? (
              <div className="rounded-2xl border border-rose-400/30 bg-rose-500/10 p-6 text-rose-100">
                <p className="font-bold">تعذر تحميل المسودة</p>
                <p className="mt-2 text-sm text-rose-100/80">
                  {(error as Error)?.message ||
                    "خطأ غير معروف — جرّب تحديث الأرقام أو راجع سجلات API."}
                </p>
              </div>
            ) : (
              <>
                {tab === "pulse" && (
                  <div className="space-y-6">
                    <StoryRail
                      beats={data.storyBeats}
                      index={storyIndex}
                      onChange={setStoryIndex}
                    />

                    <div className="grid grid-cols-2 gap-2 sm:gap-3 xl:grid-cols-4">
                      {data.storyBeats.map((b, i) => (
                        <StatOrb
                          key={b.label}
                          label={b.label}
                          value={b.value}
                          numericValue={b.numericValue}
                          hint={b.detail}
                          accent={["#f59e0b", "#ef4444", "#22c55e", "#38bdf8"][i % 4]!}
                          active={focusBeat === i || storyIndex === i}
                          onSelect={() => {
                            setFocusBeat(i);
                            setStoryIndex(i);
                          }}
                        />
                      ))}
                    </div>

                    <div className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">
                      <div className="rounded-3xl border border-white/10 bg-black/20 p-5">
                        <div className="mb-4 flex items-center justify-between">
                          <h2 className="text-lg font-bold text-white">نبض النشر اليومي</h2>
                          <Activity className="h-4 w-4 text-amber-300" />
                        </div>
                        <PulseChart
                          days={data.sabq.dailyPulse}
                          selectedDay={selectedDay}
                          onSelectDay={setSelectedDay}
                        />
                      </div>
                      <div className="space-y-4">
                        <MixMeter ai={data.sabq.aiGenerated} editorial={data.sabq.editorial} />
                        <div className="rounded-3xl border border-white/10 bg-black/20 p-5">
                          <h2 className="mb-3 text-lg font-bold text-white">خلاصة سريعة</h2>
                          <ul className="space-y-3 text-sm text-white/75">
                            <li className="flex justify-between gap-3 border-b border-white/10 pb-2">
                              <span>مواد AI</span>
                              <strong className="text-white">{data.sabq.aiGenerated}</strong>
                            </li>
                            <li className="flex justify-between gap-3 border-b border-white/10 pb-2">
                              <span>مواد تحريرية</span>
                              <strong className="text-white">{data.sabq.editorial}</strong>
                            </li>
                            <li className="flex justify-between gap-3 border-b border-white/10 pb-2">
                              <span>مباريات منتهية</span>
                              <strong className="text-white">{data.tournament.finished}</strong>
                            </li>
                            <li className="flex justify-between gap-3">
                              <span>مباريات عربية</span>
                              <strong className="text-white">
                                {data.tournament.arab.matchesPlayed}
                              </strong>
                            </li>
                          </ul>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {tab === "sabq" && (
                  <div className="space-y-6">
                    <div className="rounded-3xl border border-sky-400/20 bg-sky-500/10 p-5">
                      <h2 className="mb-2 text-lg font-bold text-white">كيف يُحسب العدد؟</h2>
                      <p className="mb-3 text-sm text-sky-50/80">
                        الرقم السابق (~آلاف) كان يلتقط أي ذكر لـ«مونديال/كأس العالم» عبر السنين.
                        العدّاد الآن مضيّق على مونديال 2026 (عنوان + نافذة زمنية):
                      </p>
                      <div className="mb-4 grid grid-cols-2 gap-2 sm:gap-3">
                        <div className="rounded-xl bg-black/20 px-3 py-2.5 sm:rounded-2xl sm:px-4 sm:py-3">
                          <p className="text-[10px] text-white/50 sm:text-xs">غرفة المباريات (wc26-*)</p>
                          <p className="text-xl font-black text-amber-200 sm:text-2xl">
                            {(data.sabq.breakdown?.matchDesk ?? 0).toLocaleString("en-US")}
                          </p>
                        </div>
                        <div className="rounded-xl bg-black/20 px-3 py-2.5 sm:rounded-2xl sm:px-4 sm:py-3">
                          <p className="text-[10px] text-white/50 sm:text-xs">تحريري رياضة منذ 2026-01-01</p>
                          <p className="text-xl font-black text-sky-200 sm:text-2xl">
                            {(data.sabq.breakdown?.editorialWindow ?? 0).toLocaleString("en-US")}
                          </p>
                        </div>
                      </div>
                      <ul className="space-y-1.5 text-xs text-white/60">
                        {(data.sabq.methodology ?? []).map((line) => (
                          <li key={line}>• {line}</li>
                        ))}
                      </ul>
                    </div>

                    <div className="grid grid-cols-2 gap-2 sm:gap-3 xl:grid-cols-4">
                      <StatOrb label="إجمالي مونديال 2026" value={data.sabq.totalArticles} accent="#f59e0b" />
                      <StatOrb label="معاينات مباريات" value={data.sabq.previews} accent="#38bdf8" />
                      <StatOrb label="تقارير مباريات" value={data.sabq.matchReports} accent="#22c55e" />
                      <StatOrb
                        label="مشاهدات"
                        value={data.sabq.totalViews}
                        hint={`متوسط ${data.sabq.avgViews.toLocaleString("en-US")}`}
                        accent="#ef4444"
                      />
                      <StatOrb label="إنفوجرافيك" value={data.sabq.infographics} accent="#a78bfa" />
                      <StatOrb label="تحليلات" value={data.sabq.analyses} accent="#fb7185" />
                      <StatOrb label="رأي" value={data.sabq.opinions} accent="#fbbf24" />
                      <StatOrb label="AI مولَّد" value={data.sabq.aiGenerated} accent="#34d399" />
                    </div>

                    <div className="rounded-3xl border border-white/10 bg-black/20 p-5">
                      <div className="mb-4 flex items-center gap-2">
                        <Eye className="h-4 w-4 text-amber-300" />
                        <h2 className="text-lg font-bold text-white">الأكثر قراءة في تغطية المونديال</h2>
                      </div>
                      <div className="space-y-2">
                        {data.sabq.topArticles.length === 0 ? (
                          <p className="text-sm text-white/50">لا مواد بعد</p>
                        ) : (
                          data.sabq.topArticles.map((a, idx) => (
                            <Link
                              key={a.id}
                              href={`/article/${a.englishSlug || a.slug}`}
                              className="flex items-center gap-3 rounded-2xl border border-white/5 bg-white/[0.03] p-3 transition hover:bg-white/[0.07]"
                            >
                              <span className="flex h-8 w-8 items-center justify-center rounded-full bg-amber-400/15 text-sm font-bold text-amber-200">
                                {idx + 1}
                              </span>
                              {a.imageUrl ? (
                                <img
                                  src={a.imageUrl}
                                  alt=""
                                  className="h-12 w-16 rounded-lg object-cover"
                                />
                              ) : (
                                <div className="h-12 w-16 rounded-lg bg-white/10" />
                              )}
                              <div className="min-w-0 flex-1">
                                <p className="line-clamp-2 text-sm font-semibold text-white">
                                  {a.title}
                                </p>
                                <p className="mt-1 text-xs text-white/45">
                                  {(a.views || 0).toLocaleString("en-US")} مشاهدة
                                  {a.aiGenerated ? " · AI" : ""}
                                  {a.articleType ? ` · ${a.articleType}` : ""}
                                </p>
                              </div>
                            </Link>
                          ))
                        )}
                      </div>
                    </div>
                  </div>
                )}

                {tab === "pitch" && (
                  <div className="space-y-6">
                    {!data.tournament.configured ? (
                      <div className="rounded-2xl border border-amber-400/20 bg-amber-500/10 p-5 text-amber-100">
                        مزوّد كأس العالم غير مفعّل في هذه البيئة — أرقام الملعب ستظهر عند توفر المفتاح.
                      </div>
                    ) : null}

                    <div className="grid grid-cols-2 gap-2 sm:gap-3 xl:grid-cols-4">
                      <StatOrb label="مباريات" value={data.tournament.totalFixtures} accent="#38bdf8" />
                      <StatOrb label="منتهية" value={data.tournament.finished} accent="#22c55e" />
                      <StatOrb
                        label="أهداف"
                        value={data.tournament.totalGoals}
                        hint={`معدل ${data.tournament.avgGoalsPerMatch}`}
                        accent="#f59e0b"
                      />
                      <StatOrb label="ركلات ترجيح" value={data.tournament.penaltyShootouts} accent="#ef4444" />
                      <StatOrb label="صفراء (لوحة)" value={data.tournament.cards.yellowOnBoard} accent="#facc15" />
                      <StatOrb label="حمراء (لوحة)" value={data.tournament.cards.redOnBoard} accent="#f87171" />
                      <StatOrb label="مباريات عربية" value={data.tournament.arab.matchesPlayed} accent="#34d399" />
                      <StatOrb
                        label="أهداف عربية (له/عليه)"
                        value={`${data.tournament.arab.goalsFor}/${data.tournament.arab.goalsAgainst}`}
                        accent="#2dd4bf"
                      />
                    </div>

                    <div className="grid grid-cols-1 gap-3 sm:gap-4 lg:grid-cols-3">
                      <LeaderCard
                        title="الهدّافون"
                        icon={<Goal className="h-4 w-4 text-amber-300" />}
                        rows={data.tournament.topScorers.map((s) => ({
                          name: s.name,
                          meta: s.team,
                          value: `${s.goals} هدف`,
                        }))}
                      />
                      <LeaderCard
                        title="صناعة اللعب"
                        icon={<Flag className="h-4 w-4 text-sky-300" />}
                        rows={data.tournament.topAssists.map((s) => ({
                          name: s.name,
                          meta: s.team,
                          value: `${s.assists} صناعة`,
                        }))}
                      />
                      <LeaderCard
                        title="البطاقات"
                        icon={<RectangleVertical className="h-4 w-4 text-rose-300" />}
                        rows={data.tournament.cards.leaders.map((s) => ({
                          name: s.name,
                          meta: s.team,
                          value: `${s.yellow} صفراء · ${s.red} حمراء`,
                        }))}
                      />
                    </div>
                  </div>
                )}

                {tab === "platform" && (
                  <div className="grid grid-cols-2 gap-2 sm:gap-3 md:grid-cols-2 xl:grid-cols-3">
                    {data.platform.map((p) => (
                      <div
                        key={p.id}
                        className="rounded-2xl border border-white/10 bg-white/[0.04] p-3 transition hover:border-amber-300/30 hover:bg-white/[0.07] sm:rounded-3xl sm:p-5"
                      >
                        <div className="mb-2 flex items-center justify-between sm:mb-3">
                          <Sparkles className="h-4 w-4 text-amber-300 sm:h-5 sm:w-5" />
                          {p.href ? (
                            <Link href={p.href} className="text-white/50 hover:text-amber-200">
                              <ExternalLink className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
                            </Link>
                          ) : null}
                        </div>
                        <h3 className="text-sm font-bold text-white sm:text-lg">{p.title}</h3>
                        <p className="mt-1.5 line-clamp-3 text-[11px] leading-relaxed text-white/60 sm:mt-2 sm:line-clamp-none sm:text-sm">
                          {p.description}
                        </p>
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}

            <p className="border-t border-white/10 pt-4 text-center text-xs text-white/35">
              هذه مسودة داخلية للمراجعة فقط — لن تظهر في واجهة الزائر حتى تُعتمد وتنشر لاحقاً.
            </p>
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}

function LeaderCard({
  title,
  icon,
  rows,
}: {
  title: string;
  icon: React.ReactNode;
  rows: Array<{ name: string; meta: string; value: string }>;
}) {
  return (
    <div className="rounded-3xl border border-white/10 bg-black/20 p-5">
      <div className="mb-3 flex items-center gap-2">
        {icon}
        <h3 className="font-bold text-white">{title}</h3>
      </div>
      <ul className="space-y-2">
        {rows.length === 0 ? (
          <li className="text-sm text-white/40">لا بيانات</li>
        ) : (
          rows.map((r, i) => (
            <li
              key={`${r.name}-${i}`}
              className="flex items-center justify-between gap-3 rounded-xl bg-white/[0.03] px-3 py-2"
            >
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-white">{r.name}</p>
                <p className="truncate text-xs text-white/45">{r.meta}</p>
              </div>
              <span className="shrink-0 text-xs font-bold text-amber-200">{r.value}</span>
            </li>
          ))
        )}
      </ul>
    </div>
  );
}
