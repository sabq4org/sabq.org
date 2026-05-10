import { Camera, ExternalLink, Sparkles } from "lucide-react";
import { Link } from "wouter";
import { Badge } from "@/components/ui/badge";
import DOMPurify from "isomorphic-dompurify";
import { useState } from "react";
import { OptimizedImage } from "@/components/OptimizedImage";
import { HERO_SIZES_ATTR } from "@/lib/cdnImage";

interface ImageWithCaptionProps {
  imageUrl: string;
  altText: string;
  captionHtml?: string;
  captionPlain?: string;
  sourceName?: string;
  sourceUrl?: string;
  relatedArticleSlugs?: string[];
  keywordTags?: string[];
  className?: string;
  isAiGenerated?: boolean;
  aiModel?: string;
  priority?: boolean;
  objectPosition?: string;
  aspectRatio?: string;
}

export function ImageWithCaption({
  imageUrl,
  altText,
  captionHtml,
  captionPlain,
  sourceName,
  sourceUrl,
  relatedArticleSlugs,
  keywordTags,
  className = "",
  isAiGenerated = false,
  aiModel,
  priority = false,
  objectPosition,
  aspectRatio,
}: ImageWithCaptionProps) {
  const [error, setError] = useState(false);
  const sanitizedCaption = captionHtml ? DOMPurify.sanitize(captionHtml) : null;

  if (!imageUrl) return null;

  const reservedAspectRatio = aspectRatio || "16 / 9";

  return (
    <figure className={`my-6 ${className}`} data-testid="figure-image-with-caption">
      <div
        className="relative bg-muted/30 rounded-md overflow-hidden"
        style={{ contain: "layout" }}
        data-testid="img-article-image"
      >
        {error ? (
          <div
            className="w-full flex items-center justify-center text-muted-foreground text-sm"
            style={{ aspectRatio: reservedAspectRatio }}
          >
            تعذر تحميل الصورة
          </div>
        ) : (
          <OptimizedImage
            src={imageUrl}
            alt={altText}
            priority={priority}
            fetchPriority={priority ? "high" : "auto"}
            wrapperClassName="w-full"
            className="w-full h-full object-cover"
            objectPosition={objectPosition || "center 20%"}
            sizes={HERO_SIZES_ATTR}
            aspectRatio={reservedAspectRatio}
            onError={() => setError(true)}
          />
        )}
        
        {/* AI-Generated Badge Overlay */}
        {isAiGenerated && (
          <div className="absolute top-3 left-3">
            <Badge 
              variant="secondary" 
              className="bg-primary/90 text-primary-foreground backdrop-blur-sm border border-primary-foreground/20 gap-1.5 shadow-lg"
              data-testid="badge-ai-generated"
            >
              <Sparkles className="h-3.5 w-3.5" />
              <span className="font-medium">مولدة بالذكاء الاصطناعي</span>
              {aiModel && (
                <span className="text-xs opacity-90">({aiModel})</span>
              )}
            </Badge>
          </div>
        )}
      </div>
      
      {/* Caption */}
      {(sanitizedCaption || captionPlain) && (
        <figcaption className="mt-3 p-3 bg-muted/50 rounded-md" data-testid="figcaption-text">
          {sanitizedCaption ? (
            <div
              className="text-sm text-muted-foreground"
              dangerouslySetInnerHTML={{ __html: sanitizedCaption }}
            />
          ) : (
            <p className="text-sm text-muted-foreground">{captionPlain}</p>
          )}
          
          {/* Source Attribution */}
          {sourceName && (
            <div className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
              <Camera className="h-3 w-3" />
              <span>المصدر:</span>
              {sourceUrl ? (
                <a
                  href={sourceUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="hover:text-primary hover:underline inline-flex items-center gap-1"
                  data-testid="link-image-source"
                >
                  {sourceName}
                  <ExternalLink className="h-3 w-3" />
                </a>
              ) : (
                <span>{sourceName}</span>
              )}
            </div>
          )}
          
          {/* Related Articles */}
          {relatedArticleSlugs && relatedArticleSlugs.length > 0 && (
            <div className="mt-3 pt-3 border-t border-border">
              <p className="text-xs font-medium text-muted-foreground mb-2">أخبار مشابهة:</p>
              <div className="flex flex-wrap gap-2">
                {relatedArticleSlugs.map((slug, index) => (
                  <Link key={slug} href={`/articles/${slug}`}>
                    <a>
                      <Badge variant="outline" className="hover-elevate cursor-pointer" data-testid={`link-related-article-${index}`}>
                        {slug}
                      </Badge>
                    </a>
                  </Link>
                ))}
              </div>
            </div>
          )}
          
          {/* Keywords */}
          {keywordTags && keywordTags.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1">
              {keywordTags.map((keyword) => (
                <Badge key={keyword} variant="secondary" className="text-xs">
                  {keyword}
                </Badge>
              ))}
            </div>
          )}
        </figcaption>
      )}
    </figure>
  );
}
