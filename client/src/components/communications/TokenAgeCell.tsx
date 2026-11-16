import { describeTokenAge, type TokenAgeTone } from "./tokenAge";
import type { TrustedEmailSender } from "@shared/schema";

const BAR_COLOR: Record<TokenAgeTone, string> = {
  fresh: "bg-[#1E9BE6]",
  warning: "bg-[#D98A00]",
  expired: "bg-[#BF3038]",
  open: "bg-[#C7D0DA]",
};

const TEXT_COLOR: Record<TokenAgeTone, string> = {
  fresh: "text-muted-foreground",
  warning: "text-[#946000] font-semibold",
  expired: "text-[#BF3038] font-semibold",
  open: "text-muted-foreground",
};

/** شريط عمر رمز النشر: يمتلئ كلما اقترب الانتهاء، ويتحول إلى الكهرماني في آخر 14 يومًا. */
export function TokenAgeCell({ sender }: { sender: TrustedEmailSender }) {
  const info = describeTokenAge(sender);
  return (
    <div className="min-w-[180px] space-y-1.5" data-testid={`token-age-${sender.id}`}>
      <div className="h-1.5 overflow-hidden rounded-full bg-[#EEF2F6]" aria-hidden="true">
        <div className={`h-full rounded-full ${BAR_COLOR[info.tone]}`} style={{ width: `${info.percent}%` }} />
      </div>
      <p className={`text-xs leading-5 ${TEXT_COLOR[info.tone]}`}>{info.text}</p>
    </div>
  );
}
