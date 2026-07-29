import { SiApple, SiGoogleplay } from "react-icons/si";

/** رابط App Store لتطبيق VARA Sports. */
export const VARA_APP_STORE_URL =
  "https://apps.apple.com/us/app/vara-sports/id6784725221?l=ar";

/** رابط Google Play لتطبيق VARA Sports. */
export const VARA_PLAY_STORE_URL =
  "https://play.google.com/store/apps/details?id=com.sabq.sports";

/**
 * إعلان ناعم لتطبيق VARA على بوابة /sports.
 * رعاية خفيفة «من سبق»: pill + روابط App Store وGoogle Play، بلا شريط ثابت.
 */
export function VaraAppPromo() {
  return (
    <div
      className="mt-4 flex w-full max-w-md items-center gap-3 rounded-2xl border border-border bg-card px-3.5 py-3 text-start shadow-sm sm:mt-5 sm:inline-flex sm:w-auto sm:rounded-full sm:py-2.5 sm:shadow-none"
      data-testid="vara-app-promo"
    >
      <span className="min-w-0 flex-1 leading-tight">
        <span className="block text-[13.5px] font-extrabold tracking-wide text-foreground sm:text-[13px]">
          VARA
          <span className="mx-1.5 font-normal text-foreground/45">·</span>
          <span className="font-bold text-foreground/75">الرياضة من سبق</span>
        </span>
        <span className="mt-0.5 block text-[12px] font-medium text-foreground/60 sm:text-[11.5px]">
          نتائج حية وتوقّعات — على App Store وGoogle Play
        </span>
      </span>
      <span className="inline-flex shrink-0 items-center gap-1.5">
        <a
          href={VARA_APP_STORE_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="grid h-10 w-10 place-items-center rounded-full bg-foreground text-background transition-opacity hover:opacity-85 sm:h-9 sm:w-9"
          data-testid="vara-app-promo-ios"
          aria-label="حمّل تطبيق VARA من App Store"
        >
          <SiApple className="h-4 w-4" aria-hidden />
        </a>
        <a
          href={VARA_PLAY_STORE_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="grid h-10 w-10 place-items-center rounded-full bg-[#01875f] text-white transition-opacity hover:opacity-90 sm:h-9 sm:w-9"
          data-testid="vara-app-promo-android"
          aria-label="حمّل تطبيق VARA من Google Play"
        >
          <SiGoogleplay className="h-4 w-4" aria-hidden />
        </a>
      </span>
    </div>
  );
}
