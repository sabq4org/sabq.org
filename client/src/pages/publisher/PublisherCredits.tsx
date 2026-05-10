import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useRoleProtection } from "@/hooks/useRoleProtection";
import { PublisherLayout } from "@/components/publisher/PublisherLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
import { Badge } from "@/components/ui/badge";
import {
  CreditCard,
  Calendar,
  TrendingUp,
  TrendingDown,
  FileText,
  Package,
} from "lucide-react";

interface CreditLog {
  id: string;
  actionType: string;
  creditsBefore: number;
  creditsAfter: number;
  creditsChanged: number;
  notes: string | null;
  createdAt: string;
  article: {
    id: string;
    title: string;
  } | null;
  creditPackage: {
    packageName: string;
  };
}

export default function PublisherCredits() {
  useRoleProtection('publisher');
  const [page, setPage] = useState(1);
  const limit = 20;

  const { data, isLoading } = useQuery<{ logs: CreditLog[]; total: number }>({
    queryKey: ["/api/publisher/credits", { page, limit }],
  });

  const getActionBadge = (actionType: string) => {
    const configs: Record<
      string,
      { variant: "default" | "secondary" | "destructive" | "outline"; label: string; icon: any }
    > = {
      credit_added: {
        variant: "default",
        label: "إضافة رصيد",
        icon: TrendingUp,
      },
      credit_used: {
        variant: "secondary",
        label: "استخدام رصيد",
        icon: TrendingDown,
      },
      credit_refunded: {
        variant: "outline",
        label: "استرجاع رصيد",
        icon: TrendingUp,
      },
      package_expired: {
        variant: "destructive",
        label: "انتهت صلاحية الباقة",
        icon: Package,
      },
    };

    const config = configs[actionType] || {
      variant: "secondary",
      label: actionType,
      icon: CreditCard,
    };

    const Icon = config.icon;

    return (
      <Badge variant={config.variant} className="gap-1" data-testid={`badge-action-${actionType}`}>
        <Icon className="h-3 w-3" />
        {config.label}
      </Badge>
    );
  };

  const totalPages = data ? Math.ceil(data.total / limit) : 0;

  return (
    <PublisherLayout>
      <div className="space-y-6" dir="rtl">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold" data-testid="text-page-title">سجل الرصيد</h1>
        <p className="text-muted-foreground mt-1">تتبع تاريخ استخدام وإضافة الرصيد</p>
      </div>

      {/* Credit Logs Table */}
      <Card data-testid="card-credit-logs">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <CreditCard className="h-5 w-5" />
            سجل العمليات
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-3">
              {[...Array(5)].map((_, i) => (
                <Skeleton key={i} className="h-16" />
              ))}
            </div>
          ) : !data || data.logs.length === 0 ? (
            <div className="text-center py-12" data-testid="text-no-logs">
              <CreditCard className="mx-auto h-12 w-12 text-muted-foreground mb-4" />
              <p className="text-lg font-medium">لا يوجد سجل</p>
              <p className="text-muted-foreground mt-1">لم يتم تسجيل أي عمليات على الرصيد بعد</p>
            </div>
          ) : (
            <>
              <div className="rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="text-right">التاريخ</TableHead>
                      <TableHead className="text-right">نوع العملية</TableHead>
                      <TableHead className="text-right">الرصيد قبل</TableHead>
                      <TableHead className="text-right">التغيير</TableHead>
                      <TableHead className="text-right">الرصيد بعد</TableHead>
                      <TableHead className="text-right">اسم الباقة</TableHead>
                      <TableHead className="text-right">المقال المرتبط</TableHead>
                      <TableHead className="text-right">ملاحظات</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data?.logs?.map((log) => (
                      <TableRow key={log.id} data-testid={`row-log-${log.id}`}>
                        <TableCell>
                          <div className="flex items-center gap-1 text-sm">
                            <Calendar className="h-3 w-3 text-muted-foreground" />
                            <span>{new Date(log.createdAt).toLocaleDateString("ar-SA-u-ca-gregory")}</span>
                            <span className="text-muted-foreground">
                              {new Date(log.createdAt).toLocaleTimeString("ar-SA", {
                                hour: "2-digit",
                                minute: "2-digit",
                              })}
                            </span>
                          </div>
                        </TableCell>
                        <TableCell>{getActionBadge(log.actionType)}</TableCell>
                        <TableCell>
                          <span className="font-medium" data-testid={`text-before-${log.id}`}>
                            {log.creditsBefore}
                          </span>
                        </TableCell>
                        <TableCell>
                          <span
                            className={`font-bold ${
                              log.creditsChanged > 0 ? "text-green-600" : "text-red-600"
                            }`}
                            data-testid={`text-change-${log.id}`}
                          >
                            {log.creditsChanged > 0 ? "+" : ""}
                            {log.creditsChanged}
                          </span>
                        </TableCell>
                        <TableCell>
                          <span className="font-medium" data-testid={`text-after-${log.id}`}>
                            {log.creditsAfter}
                          </span>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1">
                            <Package className="h-3 w-3 text-muted-foreground" />
                            <span className="text-sm">{log.creditPackage.packageName}</span>
                          </div>
                        </TableCell>
                        <TableCell>
                          {log.article ? (
                            <div className="flex items-center gap-1">
                              <FileText className="h-3 w-3 text-muted-foreground" />
                              <span className="text-sm truncate max-w-[200px]" title={log.article.title}>
                                {log.article.title}
                              </span>
                            </div>
                          ) : (
                            <span className="text-muted-foreground">-</span>
                          )}
                        </TableCell>
                        <TableCell>
                          {log.notes ? (
                            <span className="text-sm text-muted-foreground" data-testid={`text-notes-${log.id}`}>
                              {log.notes}
                            </span>
                          ) : (
                            <span className="text-muted-foreground">-</span>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>

              {/* Pagination */}
              {totalPages > 1 && (
                <div className="flex items-center justify-between mt-4">
                  <p className="text-sm text-muted-foreground" data-testid="text-pagination-info">
                    صفحة {page} من {totalPages}
                  </p>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setPage((p) => Math.max(1, p - 1))}
                      disabled={page === 1}
                      data-testid="button-prev-page"
                    >
                      السابق
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                      disabled={page === totalPages}
                      data-testid="button-next-page"
                    >
                      التالي
                    </Button>
                  </div>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>
      </div>
    </PublisherLayout>
  );
}
