import { motion } from "framer-motion";
import { Building2, Clock3, ExternalLink, MapPin, Ticket, TramFront, Users } from "lucide-react";
import type { GcOverview } from "./gcTypes";

/**
 * «دليل الحضور — جدة» — بطاقتا الملعبين بمعلومات غنية ثابتة (سعة، افتتاح،
 * وصف، رابط خرائط) فوق قائمة ملاعب الـ API، + نصائح حضور عامة. البيانات
 * الثابتة تُطابَق بالاسم؛ أي ملعب جديد من المزوّد يظهر ببطاقة أساسية.
 */

interface VenueGuide {
  match: string;
  nickname: string | null;
  capacity: string;
  opened: string;
  blurb: string;
  mapsQuery: string;
}

const VENUE_GUIDE: VenueGuide[] = [
  {
    match: "الملك عبدالله",
    nickname: "«الجوهرة المشعّة»",
    capacity: "62,345 مقعدًا",
    opened: "افتُتح 2014",
    blurb: "درّة الملاعب السعودية ومسرح الافتتاح والنهائي — تجربة حضور عالمية على ضفاف جدة.",
    mapsQuery: "King Abdullah Sports City Jeddah",
  },
  {
    match: "الأمير عبدالله الفيصل",
    nickname: null,
    capacity: "27,000 مقعد تقريبًا",
    opened: "أُعيد افتتاحه 2023 بعد تطوير شامل",
    blurb: "معقل الكرة الجداوية العريق في قلب المدينة — أجواء قريبة من المدرجات التاريخية.",
    mapsQuery: "Prince Abdullah Al Faisal Stadium Jeddah",
  },
];

const TIPS: { icon: typeof Ticket; text: string }[] = [
  { icon: Ticket, text: "احجز تذاكرك مبكرًا عبر المنصات الرسمية — مباريات الأخضر تنفد أولًا" },
  { icon: Clock3, text: "اوصل قبل الانطلاق بساعة ونصف — البوابات تزدحم قرب الصافرة" },
  { icon: TramFront, text: "استخدم مواقف المدينة الرياضية المخصصة أو التوصيل — لا تعتمد على مواقف الشارع" },
];

export function GcHostShowcase({ overview }: { overview: GcOverview | undefined }) {
  const venues = overview?.venues ?? [];
  if (venues.length === 0) return null;

  const guideFor = (name: string) => VENUE_GUIDE.find((g) => name.includes(g.match)) ?? null;

  return (
    <section id="gc-venues" dir="rtl" className="container max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
      <div className="mb-6 flex items-center gap-2">
        <Building2 className="h-6 w-6 text-emerald-500" />
        <h2 className="text-2xl font-black text-foreground">دليل الحضور — جدة</h2>
        <span className="rounded-full bg-emerald-500/10 px-2.5 py-0.5 text-sm font-bold text-emerald-600 dark:text-emerald-400">
          {venues.length} ملاعب
        </span>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        {venues.map((v, idx) => {
          const guide = guideFor(v.name);
          return (
            <motion.div
              key={`${v.name}|${v.city}`}
              initial={{ opacity: 0, y: 12 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.3, delay: Math.min(idx * 0.04, 0.3) }}
              className="overflow-hidden rounded-2xl border border-border bg-card"
            >
              <div className="bg-gradient-to-l from-[#0F8054] to-[#0A6B47] px-4 py-3">
                <p className="truncate font-black text-white">
                  {v.name}
                  {guide?.nickname ? <span className="font-bold text-amber-200"> {guide.nickname}</span> : null}
                </p>
                {v.city && <p className="text-xs text-emerald-100/80">{v.city}</p>}
              </div>
              <div className="space-y-2.5 p-4">
                {guide ? (
                  <>
                    <p className="text-sm leading-relaxed text-muted-foreground">{guide.blurb}</p>
                    <div className="flex flex-wrap gap-2">
                      <span className="inline-flex items-center gap-1.5 rounded-full bg-muted px-2.5 py-1 text-[11px] font-bold text-foreground">
                        <Users className="h-3 w-3 text-emerald-600 dark:text-emerald-400" />
                        {guide.capacity}
                      </span>
                      <span className="inline-flex items-center gap-1.5 rounded-full bg-muted px-2.5 py-1 text-[11px] font-bold text-foreground">
                        <Clock3 className="h-3 w-3 text-emerald-600 dark:text-emerald-400" />
                        {guide.opened}
                      </span>
                    </div>
                  </>
                ) : (
                  <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
                    <MapPin className="h-4 w-4" />
                    من ملاعب البطولة
                  </p>
                )}
                <a
                  href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
                    guide?.mapsQuery ?? `${v.name} ${v.city}`,
                  )}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 text-xs font-bold text-[#0A6B47] transition hover:underline dark:text-emerald-300"
                >
                  <ExternalLink className="h-3.5 w-3.5" />
                  الاتجاهات على الخرائط
                </a>
              </div>
            </motion.div>
          );
        })}
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        {TIPS.map((tip) => (
          <span
            key={tip.text}
            className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-3 py-1.5 text-[11px] font-semibold text-muted-foreground"
          >
            <tip.icon className="h-3.5 w-3.5 text-amber-500" />
            {tip.text}
          </span>
        ))}
      </div>
    </section>
  );
}
