import { Badge } from "@/components/ui/badge";
import { BookOpen, Brain, Camera, Flame, Zap } from "lucide-react";
import { publicArticleText } from "./publicArticleText";
import type { ArticleWithDetails } from "@shared/schema";

type ContentLabelProps = {
  article: ArticleWithDetails;
  locale?: "ar" | "en" | "ur";
  hideCategory?: boolean;
  imageOverlay?: boolean;
  className?: string;
};

export function ContentLabel({
  article,
  locale = "ar",
  hideCategory = false,
  imageOverlay = false,
  className = "",
}: ContentLabelProps) {
  const base = `public-label inline-flex items-center gap-1 shrink-0 ${imageOverlay ? "public-label-overlay" : ""} ${className}`;
  if (article.newsType === "breaking")
    return (
      <Badge
        variant="destructive"
        className={base}
        data-testid={`badge-content-type-${article.id}`}
      >
        <Zap className="h-3 w-3" aria-hidden="true" />
        {publicArticleText[locale].breaking}
      </Badge>
    );
  if (article.articleType === "opinion" || article.articleType === "column")
    return (
      <Badge
        className={`${base} public-label-opinion`}
        data-testid={`badge-content-type-${article.id}`}
      >
        <BookOpen className="h-3 w-3" aria-hidden="true" />
        {publicArticleText[locale].opinion}
      </Badge>
    );
  if (article.articleType === "weekly_photos")
    return (
      <Badge
        className={`${base} public-label-format`}
        data-testid={`badge-content-type-${article.id}`}
      >
        <Camera className="h-3 w-3" aria-hidden="true" />
        {publicArticleText[locale].photos}
      </Badge>
    );
  if (!hideCategory && article.category) {
    const category = article.category as {
      nameAr?: string;
      nameEn?: string;
      nameUr?: string;
      color?: string;
    };
    const name =
      locale === "en"
        ? category.nameEn || category.nameAr
        : locale === "ur"
          ? category.nameUr || category.nameAr
          : category.nameAr;
    return (
      <Badge
        variant="secondary"
        className={`${base} public-label-category`}
        style={{
          borderInlineStartColor: category.color || "var(--public-primary)",
        }}
        data-testid={`badge-content-type-${article.id}`}
      >
        {name}
      </Badge>
    );
  }
  return null;
}

export function ContentStateLabels({
  article,
  locale = "ar",
  imageOverlay = false,
}: {
  article: ArticleWithDetails;
  locale?: "ar" | "en" | "ur";
  imageOverlay?: boolean;
}) {
  const base = `public-label inline-flex items-center gap-1 shrink-0 ${imageOverlay ? "public-label-overlay" : ""}`;
  const age = article.publishedAt ? (Date.now() - new Date(article.publishedAt).getTime()) / 60000 : NaN;
  return (
    <>
      {article.isReading && (
        <Badge
          className={`${base} public-label-reading`}
          data-testid={`badge-reading-${article.id}`}
        >
          <BookOpen className="h-3 w-3" aria-hidden="true" />
          {publicArticleText[locale].reading}
        </Badge>
      )}
      {Number.isFinite(age) && age >= 0 && age <= (locale === "ar" ? 30 : 180) && (
          <Badge
            className={`${base} public-label-new`}
            data-testid={`badge-new-${article.id}`}
          >
            <Flame className="h-3 w-3" aria-hidden="true" />
            {publicArticleText[locale].fresh}
          </Badge>
        )}
      {article.aiGenerated && (
        <Badge
          className={`${base} public-label-ai`}
          data-testid={`badge-ai-content-${article.id}`}
        >
          <Brain className="h-3 w-3" aria-hidden="true" />
          {publicArticleText[locale].ai}
        </Badge>
      )}
    </>
  );
}
