import { SiApple, SiGoogleplay } from "react-icons/si";
import {
  VARA_APP_STORE_URL,
  VARA_PLAY_STORE_URL,
} from "@/components/sports/VaraAppPromo";

/**
 * إعلان ناعم لتطبيق VARA على صفحة /roshn — قبل قسم المباريات.
 * نفس هيكل إعلان البوابة الرياضية، بلمسة روشن (سماء/زمرد) لا الـ primary العام.
 */
export function RslVaraPromo() {
  return (
    <section dir="rtl" className="border-b border-border/60 bg-muted/10 py-4" data-testid="roshn-vara-promo">
      <div className="container mx-auto flex max-w-7xl justify-center px-4 sm:px-6 lg:px-8">
        <div className="flex w-full max-w-md items-center gap-3 rounded-2xl border border-sky-500/25 bg-card px-3.5 py-3 text-start shadow-sm sm:inline-flex sm:w-auto sm:rounded-full sm:py-2.5 sm:shadow-none dark:border-sky-400/20">
          <span className="min-w-0 flex-1 leading-tight">
            <span className="block text-[13.5px] font-extrabold tracking-wide text-foreground sm:text-[13px]">
              روشن أقرب مع VARA
            </span>
            <span className="mt-0.5 block text-[12px] font-medium text-foreground/60 sm:text-[11.5px]">
              مباشر، ترتيب، وتوقّعات — App Store وGoogle Play
            </span>
          </span>
          <span className="inline-flex shrink-0 items-center gap-1.5">
            <a
              href={VARA_APP_STORE_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="grid h-10 w-10 place-items-center rounded-full bg-gradient-to-bl from-emerald-800 to-[#04261b] text-sky-200 transition-opacity hover:opacity-90 sm:h-9 sm:w-9"
              aria-label="حمّل تطبيق VARA من App Store"
            >
              <SiApple className="h-4 w-4" aria-hidden />
            </a>
            <a
              href={VARA_PLAY_STORE_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="grid h-10 w-10 place-items-center rounded-full bg-[#01875f] text-white transition-opacity hover:opacity-90 sm:h-9 sm:w-9"
              data-testid="roshn-vara-promo-android"
              aria-label="حمّل تطبيق VARA من Google Play"
            >
              <SiGoogleplay className="h-4 w-4" aria-hidden />
            </a>
          </span>
        </div>
      </div>
    </section>
  );
}
