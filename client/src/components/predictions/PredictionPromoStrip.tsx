/**
 * شريط إعلانات نصية دوّارة تحت الأخبار البارزة على واجهة الصحيفة.
 * يجلب سطور إثبات اجتماعي من /api/predictions/promo-feed ويدوّرها كل بضع ثوانٍ
 * لخلق حماس حول توقّعات روشن (وغيرها) دون بطاقات أو إعلانات مدفوعة.
 */
import { useEffect, useState } from "react";
import { Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { ChevronLeft, Trophy } from "lucide-react";

type PromoItem = {
  id: string;
  text: string;
  href: string;
  kind: "crowd" | "invite" | "hype" | string;
};

type PromoFeedResponse = { items: PromoItem[] };

const ROTATE_MS = 5_500;

export default function PredictionPromoStrip() {
  const { data } = useQuery<PromoFeedResponse>({
    queryKey: ["/api/predictions/promo-feed"],
    staleTime: 60_000,
    refetchInterval: 120_000,
    retry: false,
    refetchOnWindowFocus: false,
  });

  const items = Array.isArray(data?.items) ? data.items : [];
  const [index, setIndex] = useState(0);
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    setIndex(0);
  }, [items.length]);

  useEffect(() => {
    if (items.length <= 1) return;
    const timer = setInterval(() => {
      setVisible(false);
      window.setTimeout(() => {
        setIndex((current) => (current + 1) % items.length);
        setVisible(true);
      }, 220);
    }, ROTATE_MS);
    return () => clearInterval(timer);
  }, [items.length]);

  if (items.length === 0) return null;

  const item = items[Math.min(index, items.length - 1)];
  if (!item) return null;

  return (
    <div
      className="border-y border-primary/15 bg-gradient-to-l from-primary/[0.07] via-background to-amber-500/[0.06]"
      data-testid="strip-prediction-promo"
    >
      <div className="container mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <Link
          href={item.href}
          className="group flex h-11 items-center gap-2.5 text-sm no-underline sm:h-12"
          data-testid="link-prediction-promo"
        >
          <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-black text-primary">
            <Trophy className="h-3 w-3" aria-hidden />
            توقّعات
          </span>

          <span
            className={`min-w-0 flex-1 truncate font-bold text-foreground transition-opacity duration-200 ${
              visible ? "opacity-100" : "opacity-0"
            }`}
            data-testid="text-prediction-promo"
          >
            {item.text}
          </span>

          <span className="flex shrink-0 items-center gap-0.5 text-[12px] font-bold text-primary">
            <span className="hidden sm:inline">شارِك الآن</span>
            <ChevronLeft
              className="h-4 w-4 transition-transform group-hover:-translate-x-0.5"
              strokeWidth={2.2}
              aria-hidden
            />
          </span>
        </Link>
      </div>
    </div>
  );
}
