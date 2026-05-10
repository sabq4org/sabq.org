import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Loader2, TrendingUp } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { ar } from "date-fns/locale";
import { getObjectPosition } from "@/lib/imageUtils";

interface StoryLinkWithArticle {
  id: string;
  storyId: string;
  articleId: string;
  relation: string;
  confidence: number;
  createdAt: Date;
  article?: {
    id: string;
    title: string;
    slug: string;
    englishSlug?: string | null;
    excerpt?: string;
    imageUrl?: string;
    publishedAt?: Date;
    author?: {
      firstName?: string;
      lastName?: string;
    };
  };
}

interface StoryTimelineProps {
  storyId: string;
}

export default function StoryTimeline({ storyId }: StoryTimelineProps) {
  const { data: timeline, isLoading } = useQuery<StoryLinkWithArticle[]>({
    queryKey: ["/api/stories", storyId, "timeline"],
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  if (!timeline || timeline.length === 0) {
    return (
      <Card>
        <CardContent className="py-8 text-center text-muted-foreground">
          لا توجد تحديثات بعد لهذه القصة
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4" data-testid="story-timeline">
      <div className="flex items-center gap-2 mb-4">
        <TrendingUp className="h-5 w-5 text-primary" />
        <h3 className="text-lg font-semibold">تطورات القصة</h3>
      </div>

      <div className="relative">
        {/* Timeline line */}
        <div className="absolute right-[19px] top-3 bottom-3 w-0.5 bg-border" />

        <div className="space-y-4">
          {timeline.map((link, index) => (
            <div key={link.id} className="relative" data-testid={`timeline-item-${link.id}`}>
              {/* Timeline dot */}
              <div className="absolute right-0 top-3 h-10 w-10 rounded-full bg-background border-2 border-primary flex items-center justify-center z-10">
                {link.relation === 'root' ? (
                  <div className="h-4 w-4 rounded-full bg-primary" />
                ) : (
                  <div className="h-2 w-2 rounded-full bg-primary" />
                )}
              </div>

              {/* Content card */}
              <div className="mr-16">
                <Link href={`/article/${link.article?.englishSlug || link.article?.slug}`}>
                  <Card className="hover-elevate cursor-pointer transition-all">
                    <CardContent className="p-4">
                      <div className="flex gap-4">
                        {link.article?.imageUrl && (
                          <img
                            src={link.article.imageUrl}
                            alt={link.article.title}
                            className="w-24 h-24 object-cover rounded"
                            data-testid={`img-article-${link.articleId}`}
                            style={{
                              objectPosition: getObjectPosition(link.article)
                            }}
                          />
                        )}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-start gap-2 mb-2">
                            {link.relation === 'root' && (
                              <Badge variant="default" className="flex-shrink-0">
                                البداية
                              </Badge>
                            )}
                            {index === 0 && link.relation !== 'root' && (
                              <Badge variant="secondary" className="flex-shrink-0">
                                الأحدث
                              </Badge>
                            )}
                          </div>
                          <h4 className="font-semibold mb-1 line-clamp-2" data-testid={`text-article-title-${link.articleId}`}>
                            {link.article?.title}
                          </h4>
                          {link.article?.excerpt && (
                            <p className="text-sm text-muted-foreground line-clamp-2 mb-2">
                              {link.article.excerpt}
                            </p>
                          )}
                          <div className="flex items-center gap-2 text-xs text-muted-foreground">
                            {link.article?.author && (
                              <span>
                                {link.article.author.firstName} {link.article.author.lastName}
                              </span>
                            )}
                            {link.article?.publishedAt && (
                              <>
                                <span>•</span>
                                <time>
                                  {formatDistanceToNow(new Date(link.article.publishedAt), {
                                    addSuffix: true,
                                    locale: ar,
                                  })}
                                </time>
                              </>
                            )}
                          </div>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </Link>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
