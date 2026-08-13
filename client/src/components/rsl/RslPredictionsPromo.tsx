/**
 * ترويج مسابقة توقعات روشن على الويب — هيرو دائم + شريط قبل انطلاق المباراة.
 * ليس من نظام الإعلانات المدفوعة؛ دعوة لمسابقة Prediction Core مع مشاركة رابط.
 */
import { useCallback, useState } from "react";
import { Link } from "wouter";
import { Check, Share2, Sparkles, Target } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";

export const RSL_PREDICTIONS_COMPETITION = "rsl-2026";

export function rslPredictionsUrl(opts?: { fixtureId?: number | string; contestId?: string }) {
  const params = new URLSearchParams({ competition: RSL_PREDICTIONS_COMPETITION });
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

/** بطاقة دائمة داخل هيرو /roshn */
export function RslPredictionsHeroPromo() {
  const { toast } = useToast();
  const [copied, setCopied] = useState(false);
  const href = rslPredictionsUrl();
  const shareText = "توقّع نتائج دوري روشن ونافس على النقاط — عبر سبق";

  const onShare = useCallback(() => {
    void shareOrCopy({
      title: "توقعات دوري روشن",
      text: shareText,
      url: href,
      onCopied: () => {
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      },
      toast,
    });
  }, [href, toast]);

  return (
    <div
      className="mx-auto mt-5 w-full max-w-3xl rounded-2xl border border-sky-300/30 bg-gradient-to-l from-sky-500/20 via-emerald-900/40 to-emerald-950/50 p-4 shadow-lg backdrop-blur-md sm:p-5"
      data-testid="rsl-predictions-hero-promo"
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 items-start gap-3 text-start">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-sky-300/20 text-sky-200 ring-1 ring-sky-300/30">
            <Target className="h-5 w-5" aria-hidden />
          </span>
          <div className="min-w-0">
            <p className="text-[15px] font-extrabold text-white">توقّع نتائج روشن ونافس</p>
            <p className="mt-0.5 text-[12.5px] font-medium leading-relaxed text-emerald-100/75">
              مسابقة مجانية على نقاط الموسم — اختر نتيجة المباراة قبل صافرة البداية
            </p>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2 sm:ps-2">
          <Button
            asChild
            className="flex-1 bg-sky-300 text-sky-950 hover:bg-sky-200 font-bold rounded-full px-5 sm:flex-none"
            data-testid="rsl-predictions-hero-cta"
          >
            <Link href={href}>ادخل التوقعات</Link>
          </Button>
          <Button
            type="button"
            variant="outline"
            size="icon"
            onClick={onShare}
            className="h-10 w-10 shrink-0 rounded-full border-sky-300/40 bg-white/5 text-sky-100 hover:bg-white/10 hover:text-white"
            aria-label="مشاركة رابط التوقعات"
            data-testid="rsl-predictions-hero-share"
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

/** شريط قبل انطلاق المباراة داخل MatchCenter (ثيم روشن) */
export function RslPredictionsMatchPromo({ fixtureId, homeName, awayName }: MatchPromoProps) {
  const { toast } = useToast();
  const [copied, setCopied] = useState(false);
  const href = rslPredictionsUrl({ fixtureId });
  const pair =
    homeName && awayName
      ? `${awayName} × ${homeName}`
      : "هذه المباراة";
  const shareText = `توقّع نتيجة ${pair} في دوري روشن`;

  const onShare = useCallback(() => {
    void shareOrCopy({
      title: "توقّع المباراة — دوري روشن",
      text: shareText,
      url: href,
      onCopied: () => {
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      },
      toast,
    });
  }, [href, shareText, toast]);

  return (
    <div
      className="mx-4 mt-3 rounded-2xl border border-sky-500/25 bg-sky-500/5 p-3 dark:bg-sky-400/10 lg:mx-6"
      data-testid="rsl-predictions-match-promo"
    >
      <div className="flex flex-col gap-2.5 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 items-start gap-2.5 text-start">
          <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-sky-600 dark:text-sky-300" aria-hidden />
          <div className="min-w-0">
            <p className="text-[13px] font-extrabold text-foreground">توقّع نتيجة هذه المباراة</p>
            <p className="text-[11.5px] font-medium text-muted-foreground">
              {homeName && awayName
                ? `${awayName} ضد ${homeName} — قبل صافرة البداية`
                : "نافس على نقاط الموسم قبل انطلاق المباراة"}
            </p>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Button
            asChild
            size="sm"
            className="flex-1 rounded-full bg-sky-600 font-bold text-white hover:bg-sky-500 sm:flex-none"
            data-testid="rsl-predictions-match-cta"
          >
            <Link href={href}>توقّع الآن</Link>
          </Button>
          <Button
            type="button"
            size="icon"
            variant="outline"
            onClick={onShare}
            className="h-9 w-9 shrink-0 rounded-full border-sky-500/30"
            aria-label="مشاركة رابط توقّع المباراة"
            data-testid="rsl-predictions-match-share"
          >
            {copied ? <Check className="h-4 w-4" /> : <Share2 className="h-4 w-4" />}
          </Button>
        </div>
      </div>
    </div>
  );
}
