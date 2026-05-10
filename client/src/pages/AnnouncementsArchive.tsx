import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { DashboardLayout } from "@/components/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
import { RefreshCcw, Trash2 } from "lucide-react";
import { format } from "date-fns";
import { ar } from "date-fns/locale";

interface Announcement {
  id: string;
  title: string;
  message: string;
  priority: string;
  status: string;
  channels: string[];
  publishedAt: string | null;
  createdAt: string;
}

export default function AnnouncementsArchive() {
  const { toast } = useToast();
  const [deleteDialogId, setDeleteDialogId] = useState<string | null>(null);

  const { data: announcements, isLoading } = useQuery<Announcement[]>({
    queryKey: ['/api/announcements', { status: 'archived' }],
  });

  const restoreMutation = useMutation({
    mutationFn: (id: string) => apiRequest(`/api/announcements/${id}/publish`, { method: 'POST' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/announcements'] });
      toast({ title: "✅ تم استعادة الإعلان بنجاح" });
    },
    onError: () => {
      toast({ title: "❌ فشل استعادة الإعلان", variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiRequest(`/api/announcements/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/announcements'] });
      toast({ title: "✅ تم حذف الإعلان نهائياً" });
      setDeleteDialogId(null);
    },
    onError: () => {
      toast({ title: "❌ فشل حذف الإعلان", variant: "destructive" });
    },
  });

  const getPriorityBadge = (priority: string) => {
    const variants: Record<string, { variant: any; className: string }> = {
      critical: { variant: "destructive" as const, className: "bg-red-500" },
      high: { variant: "default" as const, className: "bg-orange-500" },
      medium: { variant: "secondary" as const, className: "bg-blue-500 text-white" },
      low: { variant: "outline" as const, className: "bg-gray-500" },
    };
    const config = variants[priority] || variants.low;
    
    const labels: Record<string, string> = {
      critical: "حرج",
      high: "عالي",
      medium: "متوسط",
      low: "منخفض",
    };
    
    return (
      <Badge variant={config.variant} className={config.className}>
        {labels[priority] || priority}
      </Badge>
    );
  };

  return (
    <DashboardLayout>
      <div className="container mx-auto p-3 md:p-6 space-y-4 md:space-y-6" dir="rtl">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold">أرشيف الإعلانات</h1>
          <p className="text-sm md:text-base text-muted-foreground mt-2">
            الإعلانات المؤرشفة يمكن استعادتها أو حذفها نهائياً
          </p>
        </div>

        {isLoading ? (
          <div className="space-y-3 md:space-y-4">
            {[...Array(3)].map((_, i) => (
              <Skeleton key={i} className="h-32 w-full" />
            ))}
          </div>
        ) : announcements && announcements.length > 0 ? (
          <div className="grid gap-3 md:gap-4">
            {announcements.map((announcement) => (
              <Card key={announcement.id} data-testid={`card-announcement-${announcement.id}`}>
                <CardHeader className="p-4 md:p-6">
                  <div className="flex flex-col sm:flex-row items-start justify-between gap-3 md:gap-4">
                    <div className="flex-1 w-full">
                      <CardTitle className="text-lg md:text-xl">{announcement.title}</CardTitle>
                      <p className="text-xs md:text-sm text-muted-foreground mt-1 line-clamp-2">
                        {announcement.message.replace(/<[^>]*>/g, '')}
                      </p>
                    </div>
                    {getPriorityBadge(announcement.priority)}
                  </div>
                </CardHeader>
                <CardContent className="p-4 md:p-6 pt-0">
                  <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 md:gap-4">
                    <div className="flex flex-wrap gap-2 md:gap-3 text-xs md:text-sm text-muted-foreground">
                      <div>
                        القنوات:{' '}
                        {announcement.channels.map(ch => (
                          ch === 'dashboard' ? 'لوحة' :
                          ch === 'email' ? 'بريد' :
                          ch === 'mobile' ? 'جوال' : 'ويب'
                        )).join(', ')}
                      </div>
                      <div className="hidden sm:block">•</div>
                      <div>
                        أُرشف في: {format(new Date(announcement.createdAt), 'dd MMM yyyy', { locale: ar })}
                      </div>
                    </div>

                    <div className="flex gap-2 w-full sm:w-auto">
                      <Button
                        size="sm"
                        variant="default"
                        onClick={() => restoreMutation.mutate(announcement.id)}
                        disabled={restoreMutation.isPending}
                        data-testid={`button-restore-${announcement.id}`}
                        className="flex-1 sm:flex-initial"
                      >
                        <RefreshCcw className="ml-2 h-3.5 w-3.5 md:h-4 md:w-4" />
                        استعادة
                      </Button>

                      <Button
                        size="sm"
                        variant="destructive"
                        onClick={() => setDeleteDialogId(announcement.id)}
                        data-testid={`button-delete-${announcement.id}`}
                        className="flex-1 sm:flex-initial"
                      >
                        <Trash2 className="ml-2 h-3.5 w-3.5 md:h-4 md:w-4" />
                        <span className="hidden sm:inline">حذف نهائي</span>
                        <span className="sm:hidden">حذف</span>
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        ) : (
          <Card>
            <CardContent className="py-12">
              <div className="text-center text-muted-foreground">
                <p>لا توجد إعلانات مؤرشفة</p>
              </div>
            </CardContent>
          </Card>
        )}

        <AlertDialog open={!!deleteDialogId} onOpenChange={() => setDeleteDialogId(null)}>
          <AlertDialogContent dir="rtl">
            <AlertDialogHeader>
              <AlertDialogTitle>تأكيد الحذف النهائي</AlertDialogTitle>
              <AlertDialogDescription>
                هل أنت متأكد من حذف هذا الإعلان نهائياً؟ هذا الإجراء لا يمكن التراجع عنه ولن تتمكن من استعادة الإعلان.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter className="flex-row-reverse gap-2">
              <AlertDialogAction
                onClick={() => deleteDialogId && deleteMutation.mutate(deleteDialogId)}
                className="bg-destructive hover:bg-destructive/90"
                data-testid="button-confirm-delete"
              >
                حذف نهائي
              </AlertDialogAction>
              <AlertDialogCancel data-testid="button-cancel-delete">
                إلغاء
              </AlertDialogCancel>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </DashboardLayout>
  );
}
