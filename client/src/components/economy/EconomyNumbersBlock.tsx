/**
 * بلوك «الاقتصاد بالأرقام» للرئيسية — الشريط فقط مع رابط للقسم.
 * يختفي ذاتيًا (null) عند غياب البيانات؛ الإطفاء من اللوحة عبر ECONOMY_HOME_BLOCK لاحقًا.
 */
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { ChevronLeft, Landmark } from "lucide-react";
import { EconomyTicker } from "./EconomyTicker";
import type { EconomySnapshot } from "./types";

export function EconomyNumbersBlock() {
  const { data } = useQuery<EconomySnapshot | null>({ queryKey: ["/api/economy/snapshot"], staleTime: 5 * 60_000, refetchInterval: 10 * 60_000 });
  if (!data || data.indicators.length === 0) return null;
  return (
    <section className="container mx-auto px-3 sm:px-6 lg:px-8 py-4" aria-label="الاقتصاد بالأرقام" data-testid="economy-home-block">
      <div className="flex items-center justify-between gap-3 mb-2">
        <div className="flex items-center gap-2">
          <Landmark className="h-4 w-4 text-primary" aria-hidden="true" />
          <h2 className="text-base font-bold">الاقتصاد بالأرقام</h2>
          <span className="text-[11px] text-muted-foreground hidden sm:inline">البنك المركزي السعودي · يتحدث تلقائيًا</span>
        </div>
        <Link href="/category/economy" className="inline-flex items-center gap-0.5 text-xs font-semibold text-primary hover:underline">
          القسم الحي <ChevronLeft className="h-3.5 w-3.5" aria-hidden="true" />
        </Link>
      </div>
      <EconomyTicker snapshot={data} compact />
    </section>
  );
}

export default EconomyNumbersBlock;
