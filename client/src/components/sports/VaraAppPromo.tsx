import { ChevronLeft } from "lucide-react";
import { SiApple } from "react-icons/si";

/** رابط App Store لتطبيق VARA Sports. */
export const VARA_APP_STORE_URL =
  "https://apps.apple.com/us/app/vara-sports/id6784725221?l=ar";

/**
 * إعلان ناعم لتطبيق VARA على بوابة /sports.
 * رعاية خفيفة «من سبق»: pill واحد + رابط App Store، بلا شريط ثابت.
 * تباين أوضح ونقر أسهل على الجوال (عرض شبه كامل).
 */
export function VaraAppPromo() {
  return (
    <a
      href={VARA_APP_STORE_URL}
      target="_blank"
      rel="noopener noreferrer"
      className="mt-4 flex w-full max-w-md items-center gap-3 rounded-2xl border border-border bg-card px-3.5 py-3 text-start shadow-sm transition-colors hover:border-primary/35 hover:bg-primary/[0.05] sm:mt-5 sm:inline-flex sm:w-auto sm:rounded-full sm:py-2.5 sm:shadow-none"
      data-testid="vara-app-promo"
      aria-label="حمّل تطبيق VARA من App Store"
    >
      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-foreground text-background sm:h-9 sm:w-9">
        <SiApple className="h-4 w-4" aria-hidden />
      </span>
      <span className="min-w-0 flex-1 leading-tight">
        <span className="block text-[13.5px] font-extrabold tracking-wide text-foreground sm:text-[13px]">
          VARA
          <span className="mx-1.5 font-normal text-foreground/45">·</span>
          <span className="font-bold text-foreground/75">الرياضة من سبق</span>
        </span>
        <span className="mt-0.5 block text-[12px] font-medium text-foreground/60 sm:text-[11.5px]">
          نتائج حية وتوقّعات — متوفر على App Store
        </span>
      </span>
      <span className="inline-flex shrink-0 items-center gap-0.5 text-[12px] font-extrabold text-primary">
        حمّله
        <ChevronLeft className="h-3.5 w-3.5" strokeWidth={2.4} aria-hidden />
      </span>
    </a>
  );
}
