import { ChevronLeft } from "lucide-react";
import { SiApple } from "react-icons/si";
import { VARA_APP_STORE_URL } from "@/components/sports/VaraAppPromo";

/**
 * إعلان ناعم لتطبيق VARA على صفحة /roshn — قبل قسم المباريات.
 * نفس هيكل إعلان البوابة الرياضية، بلمسة روشن (سماء/زمرد) لا الـ primary العام.
 */
export function RslVaraPromo() {
  return (
    <section dir="rtl" className="border-b border-border/60 bg-muted/10 py-4" data-testid="roshn-vara-promo">
      <div className="container mx-auto flex max-w-7xl justify-center px-4 sm:px-6 lg:px-8">
        <a
          href={VARA_APP_STORE_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="flex w-full max-w-md items-center gap-3 rounded-2xl border border-sky-500/25 bg-card px-3.5 py-3 text-start shadow-sm transition-colors hover:border-sky-500/45 hover:bg-sky-500/[0.06] sm:inline-flex sm:w-auto sm:rounded-full sm:py-2.5 sm:shadow-none dark:border-sky-400/20 dark:hover:border-sky-400/40 dark:hover:bg-sky-400/[0.08]"
          aria-label="حمّل تطبيق VARA من App Store"
        >
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-gradient-to-bl from-emerald-800 to-[#04261b] text-sky-200 sm:h-9 sm:w-9">
            <SiApple className="h-4 w-4" aria-hidden />
          </span>
          <span className="min-w-0 flex-1 leading-tight">
            <span className="block text-[13.5px] font-extrabold tracking-wide text-foreground sm:text-[13px]">
              روشن أقرب مع VARA
            </span>
            <span className="mt-0.5 block text-[12px] font-medium text-foreground/60 sm:text-[11.5px]">
              مباشر، ترتيب، وتوقّعات من سبق
            </span>
          </span>
          <span className="inline-flex shrink-0 items-center gap-0.5 text-[12px] font-extrabold text-sky-600 dark:text-sky-400">
            حمّله
            <ChevronLeft className="h-3.5 w-3.5" strokeWidth={2.4} aria-hidden />
          </span>
        </a>
      </div>
    </section>
  );
}
