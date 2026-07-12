import { useState } from "react";
import DOMPurify from "isomorphic-dompurify";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { DashboardLayout } from "@/components/DashboardLayout";
import { DashboardPageHeader } from "@/components/dashboard/DashboardPageHeader";
import {
  Loader2,
  Eye,
  CheckCircle2,
  RotateCcw,
  XCircle,
  Clock,
  FileText,
  Inbox,
  Sparkles,
  ShieldCheck,
  ShieldAlert,
  ShieldX,
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

interface ReviewAssist {
  summary: string;
  policy: { risk: "low" | "medium" | "high"; flags: string[]; note: string };
}

const riskConfig = {
  low: { label: "منخفض", color: "text-green-700 dark:text-green-400", Icon: ShieldCheck },
  medium: { label: "متوسط", color: "text-amber-700 dark:text-amber-400", Icon: ShieldAlert },
  high: { label: "مرتفع", color: "text-red-700 dark:text-red-400", Icon: ShieldX },
};

export default function MuqtarabReview() {
  const { toast } = useToast();
  const [previewId, setPreviewId] = useState<string | null>(null);
  const [approveItem, setApproveItem] = useState<ReviewItem | null>(null);
  const [returnItem, setReturnItem] = useState<ReviewItem | null>(null);
  const [returnNotes, setReturnNotes] = useState("");
  const [rejectItem, setRejectItem] = useState<ReviewItem | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  const [assist, setAssist] = useState<ReviewAssist | null>(null);
  const [assistLoadingId, setAssistLoadingId] = useState<string | null>(null);

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

  async function runAssist(item: ReviewItem) {
    setAssist(null);
    setPreviewId(item.id);
    setAssistLoadingId(item.id);
    try {
      const res = await apiRequest<ReviewAssist>(
        `/api/admin/muqtarab/topics/${item.id}/ai/review-assist`,
        { method: "POST" },
      );
      setAssist(res);
    } catch (e) {
      toast({
        title: "خطأ في المساعد الذكي",
        description: e instanceof Error ? e.message : "حاول مرة أخرى",
        variant: "destructive",
      });
    } finally {
      setAssistLoadingId(null);
    }
  }

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

  const rejectMutation = useMutation({
    mutationFn: async ({ id, reason }: { id: string; reason: string }) =>
      apiRequest(`/api/admin/muqtarab/topics/${id}/reject`, {
        method: "POST",
        body: JSON.stringify({ reason }),
      }),
    onSuccess: () => {
      invalidate();
      setRejectItem(null);
      setRejectReason("");
      toast({ title: "تم الرفض", description: "حُذف الموضوع وأُرسل للكاتب بريد بالسبب." });
    },
    onError: (e) =>
      toast({ title: "خطأ", description: e instanceof Error ? e.message : "فشل في رفض الموضوع", variant: "destructive" }),
  });

  return (
    <DashboardLayout>
      <div className="mx-auto max-w-[1600px] space-y-6 pb-10" dir="rtl">
        <DashboardPageHeader
          icon={Inbox}
          title="مواضيع بانتظار المراجعة"
          description="راجع مواضيع كتّاب الزوايا في مُقترب وانشرها أو أعدها للتعديل."
        />

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
                            onClick={() => {
                              setAssist(null);
                              setPreviewId(item.id);
                            }}
                            data-testid={`button-preview-${item.id}`}
                          >
                            <Eye className="w-4 h-4" />
                          </Button>
                          <Button
                            size="icon"
                            variant="ghost"
                            className="text-indigo-600 hover:text-indigo-700"
                            onClick={() => runAssist(item)}
                            disabled={assistLoadingId === item.id}
                            title="ملخص + فحص سياسات ذكي"
                            data-testid={`button-ai-assist-${item.id}`}
                          >
                            {assistLoadingId === item.id ? (
                              <Loader2 className="w-4 h-4 animate-spin" />
                            ) : (
                              <Sparkles className="w-4 h-4" />
                            )}
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
                          <Button
                            size="sm"
                            variant="outline"
                            className="gap-1 text-red-700 border-red-300 hover:bg-red-50"
                            onClick={() => {
                              setRejectItem(item);
                              setRejectReason("");
                            }}
                            data-testid={`button-reject-${item.id}`}
                          >
                            <XCircle className="w-3.5 h-3.5" />
                            رفض
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
        <Dialog open={!!previewId} onOpenChange={(o) => { if (!o) { setPreviewId(null); setAssist(null); } }}>
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
                {(assist || assistLoadingId === previewId) && (
                  <div className="rounded-lg border bg-indigo-50/60 dark:bg-muted/40 p-4 space-y-3">
                    <div className="flex items-center gap-2 text-sm font-semibold">
                      <Sparkles className="w-4 h-4 text-indigo-500" />
                      مساعد المراجعة الذكي
                    </div>
                    {assistLoadingId === previewId ? (
                      <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <Loader2 className="w-4 h-4 animate-spin" />
                        جاري التحليل…
                      </div>
                    ) : assist ? (
                      <>
                        <div>
                          <div className="text-xs text-muted-foreground mb-1">ملخص</div>
                          <p className="text-sm leading-relaxed whitespace-pre-wrap">{assist.summary}</p>
                        </div>
                        <div className="flex flex-wrap items-center gap-2">
                          {(() => {
                            const rc = riskConfig[assist.policy.risk];
                            const RiskIcon = rc.Icon;
                            return (
                              <span className={`inline-flex items-center gap-1 text-sm font-medium ${rc.color}`}>
                                <RiskIcon className="w-4 h-4" />
                                خطورة السياسات: {rc.label}
                              </span>
                            );
                          })()}
                          {assist.policy.flags.map((f, i) => (
                            <Badge key={i} variant="outline" className="text-red-700 border-red-300">
                              {f}
                            </Badge>
                          ))}
                        </div>
                        {assist.policy.note && (
                          <p className="text-xs text-muted-foreground">{assist.policy.note}</p>
                        )}
                      </>
                    ) : null}
                  </div>
                )}
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
                  dangerouslySetInnerHTML={{
                    __html: DOMPurify.sanitize(
                      preview.content?.rawHtml || "<p>لا يوجد محتوى.</p>"
                    ),
                  }}
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

        {/* Reject (delete) dialog */}
        <AlertDialog open={!!rejectItem} onOpenChange={(o) => !o && setRejectItem(null)}>
          <AlertDialogContent dir="rtl">
            <AlertDialogHeader>
              <AlertDialogTitle>رفض الموضوع وحذفه</AlertDialogTitle>
              <AlertDialogDescription>
                سيُحذف «{rejectItem?.title}» نهائياً ويصل الكاتب بريد بسبب عدم النشر. اكتب السبب أدناه.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <div className="py-2">
              <label className="text-sm font-medium">سبب عدم النشر</label>
              <Textarea
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
                placeholder="اكتب سبب رفض الموضوع (سيصل الكاتب بالبريد)..."
                rows={4}
                className="mt-2"
                data-testid="textarea-reject-reason"
              />
            </div>
            <AlertDialogFooter className="gap-2">
              <AlertDialogCancel>إلغاء</AlertDialogCancel>
              <AlertDialogAction
                className="bg-red-600 hover:bg-red-700"
                onClick={() => rejectItem && rejectMutation.mutate({ id: rejectItem.id, reason: rejectReason })}
                disabled={rejectMutation.isPending || !rejectReason.trim()}
              >
                {rejectMutation.isPending ? (
                  <Loader2 className="w-4 h-4 animate-spin ml-2" />
                ) : (
                  "رفض وحذف"
                )}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </DashboardLayout>
  );
}
