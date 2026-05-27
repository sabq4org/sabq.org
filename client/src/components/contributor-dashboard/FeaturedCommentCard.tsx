import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { MessageSquareQuote } from "lucide-react";

interface FeaturedCommentCardProps {
  comment: {
    content: string;
    userName: string;
    articleTitle: string;
    articleId: string;
  } | null;
  loading?: boolean;
  onNavigate?: (articleId: string) => void;
}

export function FeaturedCommentCard({ comment, loading, onNavigate }: FeaturedCommentCardProps) {
  return (
    <Card className="hover-elevate">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
          <MessageSquareQuote className="h-4 w-4" />
          أبرز تعليق هذا الأسبوع
        </CardTitle>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="space-y-2">
            <div className="h-12 w-full animate-pulse rounded bg-muted" />
            <div className="h-4 w-24 animate-pulse rounded bg-muted" />
          </div>
        ) : comment ? (
          <div
            className={onNavigate ? "cursor-pointer" : ""}
            onClick={() => onNavigate?.(comment.articleId)}
          >
            <blockquote className="border-r-2 border-primary/40 pr-3 text-sm leading-relaxed line-clamp-3">
              "{comment.content}"
            </blockquote>
            <div className="mt-2 text-xs text-muted-foreground">
              <span className="font-medium">{comment.userName}</span>
              <span className="mx-1">·</span>
              <span className="line-clamp-1">{comment.articleTitle}</span>
            </div>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">لا توجد تعليقات هذا الأسبوع</p>
        )}
      </CardContent>
    </Card>
  );
}
