import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ShieldAlert, Snowflake } from "lucide-react";

interface SuspiciousAccount {
  userId: string;
  displayName: string;
  stats: {
    total: number;
    numeric: number;
    short: number;
    copied: number;
    distinctTexts: number;
    distinctArticles: number;
    maxPerDay: number;
  };
  junkRatio: number;
  score: number;
  frozen: boolean;
}

interface SuspiciousAccountsResponse {
  days: number;
  accounts: SuspiciousAccount[];
}

const pct = (n: number) => `${Math.round(n * 100)}%`;

/**
 * «حسابات مشبوهة (جمع نقاط)» — accounts posting junk comments (numbers,
 * symbols, copied lines, one template across many articles) to farm loyalty
 * points. Frozen accounts earn no engagement points until their 7-day
 * behaviour drops below the threshold.
 */
export function SuspiciousAccountsCard() {
  const [days, setDays] = useState<7 | 30>(7);
  const { data, isLoading, isError } = useQuery<SuspiciousAccountsResponse>({
    queryKey: ["/api/admin/comments/suspicious-accounts", { days }],
  });
  const accountsRaw = data?.accounts;
  const accounts = Array.isArray(accountsRaw) ? accountsRaw : [];

  return (
    <Card className="border-border/70 bg-card shadow-xs" dir="rtl" data-testid="card-suspicious-accounts">
      <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2 space-y-0">
        <CardTitle className="flex items-center gap-2 text-base">
          <ShieldAlert className="h-4 w-4 text-amber-600 dark:text-amber-400" />
          حسابات مشبوهة (جمع نقاط)
        </CardTitle>
        <div className="flex items-center gap-1.5">
          {([7, 30] as const).map((d) => (
            <Button
              key={d}
              size="sm"
              variant={days === d ? "default" : "outline"}
              onClick={() => setDays(d)}
              data-testid={`button-suspicious-days-${d}`}
            >
              آخر {d} يوماً
            </Button>
          ))}
        </div>
      </CardHeader>
      <CardContent>
        <p className="mb-3 text-xs text-muted-foreground">
          الحساب المشبوه: 10 تعليقات فأكثر خلال 7 أيام مع نسبة تعليقات بلا قيمة تتجاوز 50% أو أكثر من 20 تعليقاً في يوم واحد.
          الحساب «المجمّد» لا يكسب نقاط تفاعل حتى يتحسن سلوكه.
        </p>
        {isLoading ? (
          <div className="space-y-2">
            {[1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-8 w-full" />
            ))}
          </div>
        ) : isError ? (
          <p className="py-6 text-center text-sm text-destructive">تعذّر جلب الحسابات المشبوهة</p>
        ) : accounts.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">لا توجد حسابات مشبوهة في هذه الفترة</p>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-right">الحساب</TableHead>
                  <TableHead className="text-right">الدرجة</TableHead>
                  <TableHead className="text-right">التعليقات</TableHead>
                  <TableHead className="text-right">أرقام/رموز</TableHead>
                  <TableHead className="text-right">قصيرة</TableHead>
                  <TableHead className="text-right">منسوخة</TableHead>
                  <TableHead className="text-right">بلا قيمة</TableHead>
                  <TableHead className="text-right">نصوص مختلفة</TableHead>
                  <TableHead className="text-right">أخبار</TableHead>
                  <TableHead className="text-right">أقصى يومي</TableHead>
                  <TableHead className="text-right">الحالة</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {accounts.map((a) => (
                  <TableRow key={a.userId} data-testid={`row-suspicious-${a.userId}`}>
                    <TableCell className="font-medium">{a.displayName}</TableCell>
                    <TableCell className="tabular-nums">{a.score}</TableCell>
                    <TableCell className="tabular-nums">{a.stats.total}</TableCell>
                    <TableCell className="tabular-nums">{a.stats.numeric}</TableCell>
                    <TableCell className="tabular-nums">{a.stats.short}</TableCell>
                    <TableCell className="tabular-nums">{a.stats.copied}</TableCell>
                    <TableCell className="tabular-nums">{pct(a.junkRatio)}</TableCell>
                    <TableCell className="tabular-nums">{a.stats.distinctTexts}</TableCell>
                    <TableCell className="tabular-nums">{a.stats.distinctArticles}</TableCell>
                    <TableCell className="tabular-nums">{a.stats.maxPerDay}</TableCell>
                    <TableCell>
                      {a.frozen ? (
                        <Badge variant="destructive" className="gap-1">
                          <Snowflake className="h-3 w-3" />
                          مجمّد
                        </Badge>
                      ) : (
                        <Badge variant="secondary">تحت المراقبة</Badge>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
