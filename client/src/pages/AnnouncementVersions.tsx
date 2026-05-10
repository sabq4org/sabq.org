import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useParams } from "wouter";
import { DashboardLayout } from "@/components/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import { RefreshCcw, Clock } from "lucide-react";
import { format } from "date-fns";
import { ar } from "date-fns/locale";

interface Version {
  id: string;
  announcementId: string;
  versionNumber: number;
  title: string;
  message: string;
  priority: string;
  changeNote: string | null;
  changedBy: string;
  createdAt: string;
}

export default function AnnouncementVersions() {
  const { id } = useParams<{ id: string }>();
  const { toast } = useToast();
  const [restoreDialogVersion, setRestoreDialogVersion] = useState<string | null>(null);

  const { data: versions, isLoading } = useQuery<Version[]>({
    queryKey: ['/api/announcements', id, 'versions'],
    enabled: !!id,
  });

  const restoreMutation = useMutation({
    mutationFn: (versionId: string) => 
      apiRequest(`/api/announcements/${id}/versions/${versionId}/restore`, { method: 'POST' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/announcements'] });
      toast({ title: "✅ تم استعادة الإصدار بنجاح" });
      setRestoreDialogVersion(null);
    },
    onError: () => {
      toast({ title: "❌ فشل استعادة الإصدار", variant: "destructive" });
    },
  });

  const getTitleDiff = (current: string, previous?: string) => {
    if (!previous) return null;
    if (current === previous) return null;
    return (
      <div className="mt-2 p-2 bg-muted rounded text-sm">
        <div className="line-through text-muted-foreground">{previous}</div>
        <div className="text-foreground">{current}</div>
      </div>
    );
  };

  return (
    <DashboardLayout>
      <div className="container mx-auto p-3 md:p-6 space-y-4 md:space-y-6" dir="rtl">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold">سجل الإصدارات</h1>
          <p className="text-sm md:text-base text-muted-foreground mt-2">
            عرض جميع التغييرات التي تم إجراؤها على هذا الإعلان
          </p>
        </div>

        {isLoading ? (
          <div className="space-y-3 md:space-y-4">
            {[...Array(3)].map((_, i) => (
              <Skeleton key={i} className="h-32 w-full" />
            ))}
          </div>
        ) : versions && versions.length > 0 ? (
          <div className="relative">
            <div className="hidden md:block absolute right-6 top-0 bottom-0 w-px bg-border" />

            <div className="space-y-4 md:space-y-6">
              {versions.map((version, index) => {
                const previousVersion = versions[index + 1];
                const titleDiff = getTitleDiff(version.title, previousVersion?.title);

                return (
                  <div key={version.id} className="relative pr-0 md:pr-12" data-testid={`version-${version.id}`}>
                    <div className="hidden md:block absolute right-[17px] top-4 h-4 w-4 rounded-full bg-primary border-4 border-background" />

                    <Card>
                      <CardContent className="pt-4 md:pt-6">
                        <div className="flex flex-col sm:flex-row items-start justify-between gap-3 md:gap-4 mb-4">
                          <div className="flex-1 w-full">
                            <div className="flex flex-wrap items-center gap-2 md:gap-3 mb-2">
                              <Badge variant="outline">
                                الإصدار {version.versionNumber}
                              </Badge>
                              <div className="flex items-center gap-2 text-xs md:text-sm text-muted-foreground">
                                <Clock className="h-3.5 w-3.5 md:h-4 md:w-4" />
                                {format(new Date(version.createdAt), 'dd MMM yyyy، HH:mm', { locale: ar })}
                              </div>
                            </div>

                            <h3 className="text-base md:text-lg font-semibold">{version.title}</h3>
                            
                            {titleDiff && (
                              <div className="mt-2">
                                <p className="text-sm text-muted-foreground mb-1">تغيير العنوان:</p>
                                {titleDiff}
                              </div>
                            )}

                            <div className="mt-2 text-xs md:text-sm text-muted-foreground">
                              بواسطة: {version.changedBy}
                            </div>

                            {version.changeNote && (
                              <div className="mt-3 p-2 md:p-3 bg-muted rounded-lg">
                                <p className="text-xs md:text-sm font-medium mb-1">ملاحظة التغيير:</p>
                                <p className="text-xs md:text-sm">{version.changeNote}</p>
                              </div>
                            )}
                          </div>

                          {index > 0 && (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => setRestoreDialogVersion(version.id)}
                              data-testid={`button-restore-${version.id}`}
                              className="w-full sm:w-auto"
                            >
                              <RefreshCcw className="ml-2 h-3.5 w-3.5 md:h-4 md:w-4" />
                              <span className="hidden sm:inline">استعادة هذا الإصدار</span>
                              <span className="sm:hidden">استعادة</span>
                            </Button>
                          )}
                        </div>

                        <div className="mt-4 pt-4 border-t">
                          <div className="text-xs md:text-sm text-muted-foreground">
                            <span className="font-medium">الأولوية:</span>{' '}
                            <Badge variant="outline" className="mr-2">
                              {version.priority === 'critical' && 'حرج'}
                              {version.priority === 'high' && 'عالي'}
                              {version.priority === 'medium' && 'متوسط'}
                              {version.priority === 'low' && 'منخفض'}
                            </Badge>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  </div>
                );
              })}
            </div>
          </div>
        ) : (
          <Card>
            <CardContent className="py-12">
              <div className="text-center text-muted-foreground">
                <p>لا توجد إصدارات سابقة</p>
              </div>
            </CardContent>
          </Card>
        )}

        <AlertDialog open={!!restoreDialogVersion} onOpenChange={() => setRestoreDialogVersion(null)}>
          <AlertDialogContent dir="rtl">
            <AlertDialogHeader>
              <AlertDialogTitle>تأكيد الاستعادة</AlertDialogTitle>
              <AlertDialogDescription>
                هل أنت متأكد من استعادة هذا الإصدار؟ سيتم إنشاء إصدار جديد من البيانات الحالية قبل الاستعادة.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter className="flex-row-reverse gap-2">
              <AlertDialogAction
                onClick={() => restoreDialogVersion && restoreMutation.mutate(restoreDialogVersion)}
                data-testid="button-confirm-restore"
              >
                استعادة
              </AlertDialogAction>
              <AlertDialogCancel data-testid="button-cancel-restore">
                إلغاء
              </AlertDialogCancel>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </DashboardLayout>
  );
}
