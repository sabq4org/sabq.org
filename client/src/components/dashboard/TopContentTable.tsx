import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useQuery } from "@tanstack/react-query";
import { Eye, TrendingUp } from "lucide-react";
import { Link } from "wouter";

interface TopArticle {
  id: string;
  title: string;
  views: number;
  category: string;
  publishedAt: string;
  change: number;
}

export default function TopContentTable() {
  const { data: topArticles, isLoading } = useQuery<TopArticle[]>({
    queryKey: ['/api/analytics/top-content'],
  });

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <div className="h-6 w-32 bg-muted rounded animate-pulse"></div>
          <div className="h-4 w-48 bg-muted rounded animate-pulse mt-2"></div>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="h-16 bg-muted rounded animate-pulse"></div>
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>المحتوى الأكثر قراءة</CardTitle>
        <CardDescription>أفضل 10 مقالات خلال آخر 30 يوم</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {topArticles?.slice(0, 10).map((article, index) => (
            <Link key={article.id} href={`/ar/article/${article.id}`}>
              <div className="flex items-center gap-4 p-3 rounded-lg hover-elevate active-elevate-2 cursor-pointer">
                <div className="flex items-center justify-center w-8 h-8 rounded-full bg-primary/10 text-primary font-bold text-sm">
                  {index + 1}
                </div>
                
                <div className="flex-1 min-w-0">
                  <h4 className="font-medium text-sm truncate mb-1">{article.title}</h4>
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <Badge variant="secondary" className="text-xs">
                      {article.category}
                    </Badge>
                    <span>•</span>
                    <span>{new Date(article.publishedAt).toLocaleDateString('ar-SA-u-ca-gregory')}</span>
                  </div>
                </div>

                <div className="flex items-center gap-4 text-sm">
                  <div className="flex items-center gap-1">
                    <Eye className="h-4 w-4 text-muted-foreground" />
                    <span className="font-medium">{article.views.toLocaleString()}</span>
                  </div>
                  
                  {article.change > 0 && (
                    <div className="flex items-center gap-1 text-green-600">
                      <TrendingUp className="h-3 w-3" />
                      <span className="text-xs font-medium">+{article.change}%</span>
                    </div>
                  )}
                </div>
              </div>
            </Link>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
