import { Bookmark, Share2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { ArticleWithDetails } from "@shared/schema";
import { useEffect, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { isUnauthorizedError } from "@/lib/authUtils";
import { useToast } from "@/hooks/use-toast";
import { publicArticleText, type PublicArticleLocale } from "./publicArticleText";

export function ArticleActions({ article, onBookmark, onShare, locale = "ar", href }: {
  article: ArticleWithDetails;
  onBookmark?: (id: string) => void | Promise<unknown>;
  onShare?: (article: ArticleWithDetails) => void | Promise<unknown>;
  locale?: PublicArticleLocale;
  href?: string;
}) {
  const [saved, setSaved] = useState(Boolean(article.isBookmarked));
  const [copied, setCopied] = useState(false);
  const [sharing, setSharing] = useState(false);
  const { toast } = useToast();
  const cache = useQueryClient();
  const text = publicArticleText[locale];
  useEffect(() => { setSaved(Boolean(article.isBookmarked)); setCopied(false); }, [article.id, article.isBookmarked, locale]);

  const bookmark = useMutation({
    mutationFn: async (wasSaved: boolean): Promise<boolean | undefined> => {
      // Existing consumers may own a mutation and update article.isBookmarked.
      // Await its promise when supplied, never fabricate success from a void callback.
      if (onBookmark) { const result = await onBookmark(article.id); return typeof result === "boolean" ? result : undefined; }
      if (locale === "ur") {
        // Urdu uses separate add/remove endpoints, unlike AR/EN's toggle contract.
        await apiRequest(`/api/ur/article/${article.id}/bookmark`, { method: wasSaved ? "DELETE" : "POST" });
        return !wasSaved;
      }
      const result = await apiRequest<{ isBookmarked: boolean }>(`/api/${locale === "en" ? "en/" : ""}articles/${article.id}/bookmark`, { method: "POST" });
      if (typeof result?.isBookmarked !== "boolean") throw new Error(text.saveError);
      return result.isBookmarked;
    },
    onSuccess: (isBookmarked) => {
      if (typeof isBookmarked !== "boolean") return;
      setSaved(isBookmarked);
      // Refresh only article/profile lists, so revisiting a saved list reflects the mutation.
      void cache.invalidateQueries({ predicate: q => typeof q.queryKey[0] === "string" && /^\/api\/(?:en\/|ur\/)?(?:articles|article\/|profile|bookmarks|homepage)/.test(q.queryKey[0]) });
      toast({ title: isBookmarked ? text.savedDone : text.removed });
    },
    onError: (error: Error) => toast({ title: isUnauthorizedError(error) ? text.login : text.saveError, description: isUnauthorizedError(error) ? text.loginHint : error.message, variant: "destructive" }),
  });

  async function share(event: React.MouseEvent) {
    event.preventDefault(); event.stopPropagation();
    if (sharing) return;
    setSharing(true); setCopied(false);
    try {
      if (onShare) { await onShare(article); return; }
      const path = href || `${locale === "ar" ? "" : `/${locale}`}/article/${article.englishSlug || article.slug}`;
      const url = new URL(path, window.location.origin).href;
      if (navigator.share) { await navigator.share({ title: article.title, url }); toast({ title: text.shared }); }
      else { await navigator.clipboard.writeText(url); setCopied(true); toast({ title: text.copyDone }); }
    } catch (error) {
      if (!(error instanceof Error && error.name === "AbortError")) toast({ title: text.shareError, description: error instanceof Error ? error.message : undefined, variant: "destructive" });
    } finally { setSharing(false); }
  }
  return <div className="public-actions flex items-center gap-1" aria-label={text.actions}>
    <Button type="button" variant="ghost" size="sm" className="public-action" disabled={bookmark.isPending} aria-pressed={saved} aria-label={`${saved ? text.unsave : text.save}: ${article.title}`} onClick={event => { event.preventDefault(); event.stopPropagation(); if (!bookmark.isPending) bookmark.mutate(saved); }}>
      <Bookmark className={`h-4 w-4 ${saved ? "fill-current text-primary" : ""}`} aria-hidden="true" />{bookmark.isPending ? text.saving : saved ? text.saved : text.save}
    </Button>
    <Button type="button" variant="ghost" size="sm" className="public-action" disabled={sharing} onClick={share} aria-label={`${text.share}: ${article.title}`}>
      <Share2 className="h-4 w-4" aria-hidden="true" />{copied ? text.copied : text.share}
    </Button>
  </div>;
}
