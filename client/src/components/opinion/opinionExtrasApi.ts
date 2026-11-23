import { useQuery } from "@tanstack/react-query";
import { apiUrl } from "@/lib/queryClient";

export type OpinionAgreeState = {
  pollId: string;
  agreeOptionId: string;
  disagreeOptionId: string;
  agree: number;
  disagree: number;
  agreePct: number;
  disagreePct: number;
  total: number;
  userChoice: "agree" | "disagree" | null;
};

export type OpinionExtrasView = {
  articleId: string;
  canEdit: boolean;
  pullQuote: string | null;
  agreeVoteEnabled: boolean;
  author: { name: string; imageUrl: string | null } | null;
  agree: OpinionAgreeState | null;
  quoteCardUrl: string | null;
};

export const opinionExtrasKey = (articleId: string) => ["/api/opinion-extras", articleId] as const;

export function quoteCardAbsoluteUrl(path: string): string {
  const rel = apiUrl(path);
  if (/^https?:\/\//.test(rel)) return rel;
  return `${window.location.origin}${rel}`;
}

/** إضافات المقال للقارئ؛ تتحدث كل 15 ثانية بعد أن يصوّت القارئ لتبقى النسبة حيّة. */
export function useOpinionExtras(articleId: string | undefined) {
  return useQuery<OpinionExtrasView | null>({
    queryKey: opinionExtrasKey(articleId ?? ""),
    enabled: Boolean(articleId),
    retry: false,
    staleTime: 30_000,
    refetchInterval: (query) => (query.state.data?.agree?.userChoice ? 15_000 : false),
  });
}
