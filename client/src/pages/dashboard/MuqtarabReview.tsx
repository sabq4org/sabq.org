import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { DashboardLayout } from "@/components/DashboardLayout";
import {
  Loader2,
  Eye,
  CheckCircle2,
  RotateCcw,
  Clock,
  FileText,
  Inbox,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
import { formatDistanceToNow } from "date-fns";
import { ar } from "date-fns/locale";

interface ReviewItem {
  id: string;
  title: string;
  slug: string;
  status: string;
  submittedAt?: string | null;
  createdAt?: string | null;
  angle: { id: string; nameAr: string; slug: string };
  author: { id: string | null; name: string; email: string | null };
}

interface FullTopic {
  id: string;
  title: string;
  excerpt?: string | null;
  heroImageUrl?: string | null;
  content?: { rawHtml?: string; plainText?: string } | null;
}

export default function MuqtarabReview() {
  const { toast } = useToast();
  const [previewId, setPreviewId] = useState<string | null>(null);
  const [approveItem, setApproveItem] = useState<ReviewItem | null>(null);
  const [returnItem, setReturnItem] = useState<ReviewItem | null>(null);
  const [returnNotes, setReturnNotes] = useState("");

  const { data: queueRaw, isLoading } = useQuery<ReviewItem[]>({
    queryKey: ["/api/admin/muqtarab/review-queue"],
    queryFn: async () => apiRequest("/api/admin/muqtarab/review-queue"),
  });
  const queue = Array.isArray(queueRaw) ? queueRaw : [];

  const { data: preview, isLoading: isPreviewLoading } = useQuery<FullTopic>({
    queryKey: ["/api/admin/muqtarab/topics", previewId],
    queryFn: async () => apiRequest(`/api/admin/muqtarab/topics/${previewId}`),
    enabled: !!previewId,
  });

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["/api/admin/muqtarab/review-queue"] });
  };

  const approveMutation = useMutation({
    mutationFn: async (id: string) =>
      apiRequest(`/api/admin/muqtarab/topics/${id}/approve`, { method: "POST" }),
    onSuccess: () => {
      invalidate();
      setApproveItem(null);
      toast({ title: "تم النشر", description: "أصبح الموضوع متاحاً للقراء." });
    },
    onError: (e) =>
      toast({ title: "خطأ", description: e instanceof Error ? e.message : "فشل في نشر الموضوع", variant: "destructive" }),
  });

  const returnMutation = useMutation({
    mutationFn: async ({ id, notes }: { id: string; notes: string }) =>
      apiRequest(`/api/admin/muqtarab/topics/${id}/return`, {
        method: "POST",
        body: JSON.stringify({ reviewNotes: notes }),
      }),
    onSuccess: () => {
      invalidate();
      setReturnItem(null);
      setReturnNotes("");
      toast({ title: "تم الإرجاع", description: "أُعيد الموضوع للكاتب مع ملاحظاتك." });
    },
    onError: (e) =>
      toast({ title: "خطأ", description: e instanceof Error ? e.message : "فشل في إرجاع الموضوع", variant: "destructive" }),
  });

  return (
    <DashboardLayout>
      <div className="space-y-6 p-6" dir="rtl">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Inbox className="w-6 h-6 text-blue-500" />
            مواضيع بانتظار المراجعة
          </h1>
          <p className="text-muted-foreground">
            راجع مواضيع كتّاب الزوايا في مُقترب وانشرها أو أعدها للتعديل
          </p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileText className="w-5 h-5" />
              الطابور ({queue.length})
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {isLoading ? (
              <div className="flex justify-center p-12">
                <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
              </div>
            ) : queue.length === 0 ? (
              <div className="text-center p-12 text-muted-foreground">
                لا توجد مواضيع بانتظار المراجعة 🎉
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-right">الموضوع</TableHead>
                    <TableHead className="text-right">الزاوية</TableHead>
                    <TableHead className="text-right">الكاتب</TableHead>
                    <TableHead className="text-right">أُرسل</TableHead>
                    <TableHead className="text-right">الإجراءات</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {queue.map((item) => (
                    <TableRow key={item.id}>
                      <TableCell className="font-medium">{item.title}</TableCell>
                      <TableCell>
                        <Badge variant="outline">{item.angle.nameAr}</Badge>
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-col">
                          <span>{item.author.name}</span>
                          {item.author.email && (
                            <span className="text-xs text-muted-foreground" dir="ltr">
                              {item.author.email}
                            </span>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <span className="text-sm text-muted-foreground flex items-center gap-1">
                          <Clock className="w-3.5 h-3.5" />
                          {item.submittedAt
                            ? formatDistanceToNow(new Date(item.submittedAt), { locale: ar, addSuffix: true })
                            : "—"}
                        </span>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Button
                            size="icon"
                            variant="ghost"
                            onClick={() => setPreviewId(item.id)}
                            data-testid={`button-preview-${item.id}`}
                          >
                            <Eye className="w-4 h-4" />
                          </Button>
                          <Button
                            size="sm"
                            variant="default"
                            className="gap-1 bg-green-600 hover:bg-green-700"
                            onClick={() => setApproveItem(item)}
                            data-testid={`button-approve-${item.id}`}
                          >
                            <CheckCircle2 className="w-3.5 h-3.5" />
                            نشر
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            className="gap-1 text-amber-700 border-amber-300 hover:bg-amber-50"
                            onClick={() => {
                              setReturnItem(item);
                              setReturnNotes("");
                            }}
                            data-testid={`button-return-${item.id}`}
                          >
                            <RotateCcw className="w-3.5 h-3.5" />
                            إرجاع
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        {/* Preview dialog */}
        <Dialog open={!!previewId} onOpenChange={(o) => !o && setPreviewId(null)}>
          <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto" dir="rtl">
            <DialogHeader>
              <DialogTitle>{preview?.title || "معاينة الموضوع"}</DialogTitle>
            </DialogHeader>
            {isPreviewLoading ? (
              <div className="flex justify-center p-8">
                <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
              </div>
            ) : preview ? (
              <div className="space-y-4">
                {preview.heroImageUrl && (
                  <img
                    src={preview.heroImageUrl}
                    alt={preview.title}
                    className="w-full max-h-64 object-cover rounded-lg border"
                  />
                )}
                {preview.excerpt && (
                  <p className="text-muted-foreground">{preview.excerpt}</p>
                )}
                <div
                  className="prose prose-sm dark:prose-invert max-w-none"
                  dangerouslySetInnerHTML={{ __html: preview.content?.rawHtml || "<p>لا يوجد محتوى.</p>" }}
                />
              </div>
            ) : null}
          </DialogContent>
        </Dialog>

        {/* Approve confirm */}
        <AlertDialog open={!!approveItem} onOpenChange={(o) => !o && setApproveItem(null)}>
          <AlertDialogContent dir="rtl">
            <AlertDialogHeader>
              <AlertDialogTitle>نشر الموضوع</AlertDialogTitle>
              <AlertDialogDescription>
                سيُنشر «{approveItem?.title}» ويصبح متاحاً للقراء فوراً.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter className="gap-2">
              <AlertDialogCancel>إلغاء</AlertDialogCancel>
              <AlertDialogAction
                className="bg-green-600 hover:bg-green-700"
                onClick={() => approveItem && approveMutation.mutate(approveItem.id)}
                disabled={approveMutation.isPending}
              >
                {approveMutation.isPending ? (
                  <Loader2 className="w-4 h-4 animate-spin ml-2" />
                ) : (
                  "نشر"
                )}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        {/* Return dialog */}
        <AlertDialog open={!!returnItem} onOpenChange={(o) => !o && setReturnItem(null)}>
          <AlertDialogContent dir="rtl">
            <AlertDialogHeader>
              <AlertDialogTitle>إرجاع الموضوع للتعديل</AlertDialogTitle>
              <AlertDialogDescription>
                سيُعاد «{returnItem?.title}» للكاتب مع ملاحظاتك ليعدّله ويعيد إرساله.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <div className="py-2">
              <label className="text-sm font-medium">ملاحظات المراجعة</label>
              <Textarea
                value={returnNotes}
                onChange={(e) => setReturnNotes(e.target.value)}
                placeholder="وضّح للكاتب ما يحتاج تعديلاً..."
                rows={4}
                className="mt-2"
                data-testid="textarea-return-notes"
              />
            </div>
            <AlertDialogFooter className="gap-2">
              <AlertDialogCancel>إلغاء</AlertDialogCancel>
              <AlertDialogAction
                className="bg-amber-600 hover:bg-amber-700"
                onClick={() => returnItem && returnMutation.mutate({ id: returnItem.id, notes: returnNotes })}
                disabled={returnMutation.isPending || !returnNotes.trim()}
              >
                {returnMutation.isPending ? (
                  <Loader2 className="w-4 h-4 animate-spin ml-2" />
                ) : (
                  "إرجاع للتعديل"
                )}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </DashboardLayout>
  );
}
