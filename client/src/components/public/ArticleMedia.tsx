import { publicArticleText, type PublicArticleLocale } from "./publicArticleText";
import { BookOpen, Brain, Play } from "lucide-react";
import {
  getCacheBustedImageUrl,
  getObjectPosition,
  getArticleDisplayImageUrl,
} from "@/lib/imageUtils";
import type { ArticleWithDetails } from "@shared/schema";
import { OptimizedImage } from "../OptimizedImage";

export function ArticleMedia({
  article,
  locale = "ar",
  className = "",
  priority = false,
  variant = "grid",
}: {
  article: ArticleWithDetails;
  locale?: PublicArticleLocale;
  className?: string;
  priority?: boolean;
  variant?: "grid" | "list" | "compact";
}) {
  const source = getArticleDisplayImageUrl(article) || (article as ArticleWithDetails & { featuredImage?: string }).featuredImage;
  const url = getCacheBustedImageUrl(source, article.updatedAt);
  return (
    <div
      className={`public-card-media relative overflow-hidden bg-slate-100 dark:bg-slate-800 ${className}`}
    >
      {url ? (
        <OptimizedImage
          src={url}
          alt={article.title}
          className="h-full w-full object-cover"
          wrapperClassName="h-full w-full"
          objectPosition={getObjectPosition(article)}
          priority={priority}
          preferSize={variant === "grid" ? "medium" : "small"}
        />
      ) : (
        <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-primary/10 to-background">
          <BookOpen
            className="h-10 w-10 text-primary/30"
            aria-hidden="true"
          />{" "}
        </div>
      )}
      {(article.isAiGeneratedThumbnail || article.isAiGeneratedImage) && (
        <span className="public-media-disclosure" title={publicArticleText[locale].imageAi} aria-label={publicArticleText[locale].imageAi}>
          <Brain className="h-3 w-3" aria-hidden="true" /> AI
        </span>
      )}
      {(article as unknown as { isVideoTemplate?: boolean })
        .isVideoTemplate && (
        <span className="public-media-play" role="img" aria-label={publicArticleText[locale].video}>
          <Play className="h-5 w-5 fill-current" aria-hidden="true" />
        </span>
      )}
    </div>
  );
}
