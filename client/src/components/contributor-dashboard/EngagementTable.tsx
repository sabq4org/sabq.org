import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Eye, ThumbsUp, MessageCircle, Bookmark } from "lucide-react";

interface TopArticle {
  id: string;
  title: string;
  views: number;
  likes: number;
  comments: number;
  bookmarks: number;
  publishedAt: string | null;
}

interface EngagementTableProps {
  articles: TopArticle[];
  loading?: boolean;
  onNavigate?: (id: string) => void;
  title?: string;
  emptyLabel?: string;
}

export function EngagementTable({
  articles,
  loading,
  onNavigate,
  title = "أعلى المقالات تفاعلاً",
  emptyLabel = "لا توجد مقالات منشورة",
}: EngagementTableProps) {
  return (
    <Card className="hover-elevate">
      <CardHeader className="pb-3">
        <CardTitle className="text-base">{title}</CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        {loading ? (
          <div className="p-6 space-y-3">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="h-10 animate-pulse rounded bg-muted" />
            ))}
          </div>
        ) : articles.length === 0 ? (
          <p className="p-6 text-sm text-muted-foreground text-center">{emptyLabel}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/30">
                  <th className="px-4 py-2.5 text-right font-medium text-muted-foreground">#</th>
                  <th className="px-4 py-2.5 text-right font-medium text-muted-foreground">العنوان</th>
                  <th className="px-4 py-2.5 text-center font-medium text-muted-foreground">
                    <Eye className="h-3.5 w-3.5 inline" />
                  </th>
                  <th className="px-4 py-2.5 text-center font-medium text-muted-foreground">
                    <ThumbsUp className="h-3.5 w-3.5 inline" />
                  </th>
                  <th className="px-4 py-2.5 text-center font-medium text-muted-foreground">
                    <MessageCircle className="h-3.5 w-3.5 inline" />
                  </th>
                  <th className="px-4 py-2.5 text-center font-medium text-muted-foreground">
                    <Bookmark className="h-3.5 w-3.5 inline" />
                  </th>
                </tr>
              </thead>
              <tbody>
                {articles.map((article, i) => (
                  <tr
                    key={article.id}
                    className="border-b last:border-0 hover:bg-muted/20 transition-colors cursor-pointer"
                    onClick={() => onNavigate?.(article.id)}
                  >
                    <td className="px-4 py-2.5 text-muted-foreground">
                      {i < 3 ? (
                        <Badge variant="secondary" className="text-xs px-1.5 py-0.5">
                          {i + 1}
                        </Badge>
                      ) : (
                        i + 1
                      )}
                    </td>
                    <td className="px-4 py-2.5 max-w-[200px] truncate font-medium">
                      {article.title}
                    </td>
                    <td className="px-4 py-2.5 text-center tabular-nums">
                      {article.views.toLocaleString()}
                    </td>
                    <td className="px-4 py-2.5 text-center tabular-nums">
                      {article.likes.toLocaleString()}
                    </td>
                    <td className="px-4 py-2.5 text-center tabular-nums">
                      {article.comments.toLocaleString()}
                    </td>
                    <td className="px-4 py-2.5 text-center tabular-nums">
                      {article.bookmarks.toLocaleString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
