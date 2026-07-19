import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Medal, TrendingUp } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { apiUrl } from "@/lib/queryClient";

interface RankingData {
  rank: number | null;
  totalAuthors: number;
  percentile: number;
  myViews: number;
  isTopTen: boolean;
}

interface ContributorRankCardProps {
  roleType?: "opinion_author" | "reporter";
  loading?: boolean;
}

export function ContributorRankCard({ roleType = "opinion_author", loading: parentLoading }: ContributorRankCardProps) {
  const { data, isLoading } = useQuery<RankingData>({
    queryKey: ["/api/contributor/ranking", roleType],
    queryFn: async () => {
      const res = await fetch(apiUrl(`/api/contributor/ranking?role=${roleType}`));
      if (!res.ok) throw new Error("Failed to fetch ranking");
      return res.json();
    },
    staleTime: 5 * 60 * 1000,
  });

  const loading = parentLoading || isLoading;

  return (
    <Card className="hover-elevate">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
          <Medal className="h-4 w-4" />
          ترتيبك هذا الشهر
        </CardTitle>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="space-y-2">
            <div className="h-10 w-16 animate-pulse rounded bg-muted" />
            <div className="h-4 w-32 animate-pulse rounded bg-muted" />
          </div>
        ) : data ? (
          data.rank !== null ? (
            <div className="space-y-3">
              <div className="flex items-baseline gap-2">
                <span className="text-3xl font-bold">#{data.rank}</span>
                <span className="text-sm text-muted-foreground">من {data.totalAuthors}</span>
                {data.isTopTen && (
                  <Badge className="bg-warning/15 text-warning dark:bg-warning/15 dark:text-warning text-xs">
                    الأكثر قراءة
                  </Badge>
                )}
              </div>

              <div className="w-full bg-muted rounded-full h-2 overflow-hidden">
                <div
                  className="h-full rounded-full bg-gradient-to-l from-primary to-primary/60 transition-all duration-500"
                  style={{ width: `${Math.max(data.percentile, 3)}%` }}
                />
              </div>

              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <TrendingUp className="h-3.5 w-3.5" />
                <span>أعلى من {data.percentile}% من الكتّاب</span>
              </div>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">لم تنشر مقالات هذا الشهر بعد</p>
          )
        ) : (
          <p className="text-sm text-muted-foreground">لا تتوفر بيانات كافية</p>
        )}
      </CardContent>
    </Card>
  );
}
