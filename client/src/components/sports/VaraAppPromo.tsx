import { SiApple } from "react-icons/si";

/** رابط App Store لتطبيق VARA Sports. */
export const VARA_APP_STORE_URL =
  "https://apps.apple.com/us/app/vara-sports/id6784725221?l=ar";

/**
 * إعلان ناعم لتطبيق VARA على بوابة /sports.
 * رعاية خفيفة «من سبق»: سطر واحد + رابط App Store، بلا شريط ثابت ولا ضجيج.
 * يظهر لكل الزوار (الرابط يفتح App Store على iPhone أو Mac).
 */
export function VaraAppPromo() {
  return (
    <a
      href={VARA_APP_STORE_URL}
      target="_blank"
      rel="noopener noreferrer"
      className="mt-5 inline-flex max-w-full items-center gap-2.5 rounded-full border border-border/80 bg-muted/40 px-3.5 py-2 text-start transition-colors hover:border-primary/25 hover:bg-primary/[0.06] sm:mt-6"
      data-testid="vara-app-promo"
      aria-label="حمّل تطبيق VARA من App Store"
    >
      <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-foreground text-background">
        <SiApple className="h-3.5 w-3.5" aria-hidden />
      </span>
      <span className="min-w-0 leading-tight">
        <span className="block text-[12.5px] font-extrabold tracking-wide text-foreground">
          VARA
          <span className="mx-1.5 font-normal text-muted-foreground">·</span>
          <span className="font-bold text-muted-foreground">الرياضة من سبق</span>
        </span>
        <span className="block text-[11px] text-muted-foreground">
          نتائج حية وتوقّعات — حمّله من App Store
        </span>
      </span>
    </a>
  );
}
