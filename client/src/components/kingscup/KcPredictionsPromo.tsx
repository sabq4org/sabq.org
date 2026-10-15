/**
 * ترويج مسابقة توقعات كأس خادم الحرمين الشريفين — بطاقة دائمة في الهيرو + شريط
 * قبل انطلاق المباراة داخل حوارية المباراة. نظير RslPredictionsPromo بهوية
 * الكأس (زمردي + ذهبي).
 *
 * البوابة بيانات حية لا علم بيئة: نكتشف البطولة من /api/predictions/competitions
 * بالبادئة "kings-cup" (المزروع: kings-cup-2026). ما دامت البطولة draft على
 * الإنتاج لا يظهر أي ترويج، وفور تفعيلها بأمر التشغيل يظهر تلقائيًا بلا نشر —
 * نفس نهج اكتشاف الـslug في تطبيقي أندرويد وiOS.
 */
import { useCallback, useState } from "react";
import { Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Check, Share2, Sparkles, Target } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";

const KC_COMPETITION_PREFIX = "kings-cup";

type PredCompetitionRow = { slug: string; status: string };

/** slug بطولة الكأس المفعّلة على المنصة المركزية — null قبل التفعيل. */
export function useKcPredictionsSlug(): string | null {
  const { data } = useQuery<{ competitions: PredCompetitionRow[] }>({
    queryKey: ["/api/predictions/competitions"],
    staleTime: 5 * 60_000,
  });
  const competitions = Array.isArray(data?.competitions) ? data.competitions : [];
  return competitions.find((c) => c.slug.startsWith(KC_COMPETITION_PREFIX))?.slug ?? null;
}

export function kcPredictionsUrl(slug: string, opts?: { fixtureId?: number | string; contestId?: string }) {
  const params = new URLSearchParams({ competition: slug });
  if (opts?.contestId) params.set("contest", opts.contestId);
  else if (opts?.fixtureId != null) params.set("fixture", String(opts.fixtureId));
  return `/predictions?${params.toString()}`;
}

function absoluteUrl(path: string) {
  if (path.startsWith("http")) return path;
  if (typeof window !== "undefined") return `${window.location.origin}${path}`;
  return `https://sabq.org${path}`;
}

async function shareOrCopy(args: {
  title: string;
  text: string;
  url: string;
  onCopied: () => void;
  toast: ReturnType<typeof useToast>["toast"];
}) {
  const fullUrl = absoluteUrl(args.url);
  if (typeof navigator !== "undefined" && typeof navigator.share === "function") {
    try {
      await navigator.share({ title: args.title, text: args.text, url: fullUrl });
      return;
    } catch (err) {
      // إلغاء المستخدم — لا ننسخ قسراً
      if (err instanceof DOMException && err.name === "AbortError") return;
    }
  }
  try {
    await navigator.clipboard.writeText(`${args.text}\n${fullUrl}`);
    args.onCopied();
    args.toast({ title: "تم النسخ", description: "نسخنا نص الدعوة والرابط إلى الحافظة" });
  } catch {
    args.toast({
      title: "تعذّرت المشاركة",
      description: "انسخ الرابط يدوياً من شريط العنوان",
      variant: "destructive",
    });
  }
}

/** بطاقة دائمة داخل هيرو /kings-cup — تظهر فقط بعد تفعيل البطولة على المنصة. */
export function KcPredictionsHeroPromo() {
  const { toast } = useToast();
  const [copied, setCopied] = useState(false);
  const slug = useKcPredictionsSlug();
  if (!slug) return null;

  const href = kcPredictionsUrl(slug);
  const shareText = "توقّع نتائج كأس خادم الحرمين الشريفين ونافس على الجائزة — عبر سبق";

  const onShare = () => {
    void shareOrCopy({
      title: "توقعات كأس الملك",
      text: shareText,
      url: href,
      onCopied: () => {
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      },
      toast,
    });
  };

  return (
    <div
      className="mx-auto mt-5 w-full max-w-3xl rounded-2xl border border-amber-300/30 bg-gradient-to-l from-amber-400/15 via-emerald-900/40 to-emerald-950/50 p-4 shadow-lg backdrop-blur-md sm:p-5"
      data-testid="kc-predictions-hero-promo"
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 items-start gap-3 text-start">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-amber-300/20 text-amber-200 ring-1 ring-amber-300/30">
            <Target className="h-5 w-5" aria-hidden />
          </span>
          <div className="min-w-0">
            <p className="text-[15px] font-extrabold text-white">توقّع نتائج الكأس ونافس</p>
            <p className="mt-0.5 text-[12.5px] font-medium leading-relaxed text-emerald-100/75">
              مسابقة مجانية — أصِب النتيجة الدقيقة قبل صافرة البداية وتقاسم الجائزة
            </p>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2 sm:ps-2">
          <Button
            asChild
            className="flex-1 bg-amber-300 text-emerald-950 hover:bg-amber-200 font-bold rounded-full px-5 sm:flex-none"
            data-testid="kc-predictions-hero-cta"
          >
            <Link href={href}>ادخل التوقعات</Link>
          </Button>
          <Button
            type="button"
            variant="outline"
            size="icon"
            onClick={onShare}
            className="h-10 w-10 shrink-0 rounded-full border-amber-300/40 bg-white/5 text-amber-100 hover:bg-white/10 hover:text-white"
            aria-label="مشاركة رابط التوقعات"
            data-testid="kc-predictions-hero-share"
          >
            {copied ? <Check className="h-4 w-4" /> : <Share2 className="h-4 w-4" />}
          </Button>
        </div>
      </div>
    </div>
  );
}

type MatchPromoProps = {
  fixtureId: number;
  homeName?: string | null;
  awayName?: string | null;
};

/** شريط قبل انطلاق المباراة داخل KcMatchDialog (معرّف المباراة API-Football —
 *  نفس external_ref في مسابقات المنصة، فالربط العميق يصيب البطاقة مباشرة). */
export function KcPredictionsMatchPromo({ fixtureId, homeName, awayName }: MatchPromoProps) {
  const { toast } = useToast();
  const [copied, setCopied] = useState(false);
  const slug = useKcPredictionsSlug();

  const href = slug ? kcPredictionsUrl(slug, { fixtureId }) : "";
  const pair = homeName && awayName ? `${awayName} × ${homeName}` : "هذه المباراة";
  const shareText = `توقّع نتيجة ${pair} في كأس خادم الحرمين الشريفين`;

  const onShare = useCallback(() => {
    void shareOrCopy({
      title: "توقّع المباراة — كأس الملك",
      text: shareText,
      url: href,
      onCopied: () => {
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      },
      toast,
    });
  }, [href, shareText, toast]);

  if (!slug) return null;

  return (
    <div
      className="rounded-2xl border border-amber-500/25 bg-amber-500/5 p-3 dark:bg-amber-400/10"
      data-testid="kc-predictions-match-promo"
    >
      <div className="flex flex-col gap-2.5 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 items-start gap-2.5 text-start">
          <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-amber-600 dark:text-amber-300" aria-hidden />
          <div className="min-w-0">
            <p className="text-[13px] font-extrabold text-foreground">توقّع نتيجة هذه المباراة</p>
            <p className="text-[11.5px] font-medium text-muted-foreground">
              {homeName && awayName
                ? `${awayName} ضد ${homeName} — قبل صافرة البداية`
                : "أصِب النتيجة الدقيقة قبل انطلاق المباراة"}
            </p>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Button
            asChild
            size="sm"
            className="flex-1 rounded-full bg-amber-500 font-bold text-white hover:bg-amber-400 sm:flex-none"
            data-testid="kc-predictions-match-cta"
          >
            <Link href={href}>توقّع الآن</Link>
          </Button>
          <Button
            type="button"
            size="icon"
            variant="outline"
            onClick={onShare}
            className="h-9 w-9 shrink-0 rounded-full border-amber-500/30"
            aria-label="مشاركة رابط توقّع المباراة"
            data-testid="kc-predictions-match-share"
          >
            {copied ? <Check className="h-4 w-4" /> : <Share2 className="h-4 w-4" />}
          </Button>
        </div>
      </div>
    </div>
  );
}
