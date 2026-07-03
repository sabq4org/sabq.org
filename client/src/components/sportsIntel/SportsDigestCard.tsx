/**
 * الموجز الرياضي المخصّص — موجز يولّده المحرّك من متابعات المستخدم (فِرقه/
 * بطولاته). يتطلّب جلسة؛ يستهلك /api/sports/intel/digest. يختفي بسلاسة لغير
 * المسجّلين أو من لا متابعات له.
 */
import { useQuery } from "@tanstack/react-query";
import { Sparkles } from "lucide-react";
import type { DigestResponse } from "./types";

export function SportsDigestCard({ enabled = true }: { enabled?: boolean }) {
  const { data } = useQuery<DigestResponse>({
    queryKey: ["/api/sports/intel/digest"],
    enabled,
    staleTime: 15 * 60_000,
    retry: false,
  });

  if (!data?.configured || !data.digest) return null;

  return (
    <div className="mb-6 rounded-2xl border border-primary/15 bg-gradient-to-l from-primary/[0.06] to-transparent p-5">
      <div className="mb-2 flex items-center gap-2">
        <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-primary/10 text-primary">
          <Sparkles className="h-4 w-4" />
        </span>
        <div className="flex flex-col">
          <h3 className="text-base font-extrabold text-foreground">{data.digest.headline}</h3>
          <span className="text-[11px] font-bold text-primary/70">موجزك الرياضي — مخصّص لمتابعاتك</span>
        </div>
      </div>
      <p className="text-sm leading-relaxed text-foreground">{data.digest.body}</p>
    </div>
  );
}
