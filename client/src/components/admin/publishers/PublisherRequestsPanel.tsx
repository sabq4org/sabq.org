import { useState } from "react";
import { Link } from "wouter";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
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
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { formatNumber, formatRelativeTime } from "@/lib/format";
import { cn } from "@/lib/utils";
import { BellRing, Building2, Check, Loader2, Trash2, X } from "lucide-react";

interface PublisherRequest {
  id: string;
  type: string;
  message: string | null;
  status: string;
  createdAt: string;
  handledAt: string | null;
  publisherId: string;
  agencyName: string;
  logoUrl: string | null;
}

const REQUEST_LABELS: Record<string, string> = {
  renewal: "تجديد الباقة",
  window_extension: "تمديد فترة النشر",
  other: "طلب آخر",
};

const STATUS_TABS = [
  { value: "open", label: "مفتوحة" },
  { value: "closed", label: "مقبولة" },
  { value: "rejected", label: "مرفوضة" },
];

const STATUS_META: Record<string, { label: string; className: string }> = {
  open: { label: "مفتوح", className: "border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200" },
  closed: { label: "مقبول", className: "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-200" },
  rejected: { label: "مرفوض", className: "border-red-200 bg-red-50 text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-200" },
};

export function PublisherRequestsPanel({ openCount }: { openCount: number }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [statusTab, setStatusTab] = useState("open");
  const [rejecting, setRejecting] = useState<PublisherRequest | null>(null);
  const [rejectNote, setRejectNote] = useState("");
  const [deleting, setDeleting] = useState<PublisherRequest | null>(null);

  const { data, isLoading } = useQuery<{ requests: PublisherRequest[] }>({
    queryKey: ["/api/admin/publishers/requests", { status: statusTab }],
    refetchInterval: statusTab === "open" ? 120_000 : false,
  });
  const requests = Array.isArray(data?.requests) ? data!.requests : [];

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["/api/admin/publishers/requests"] });
    queryClient.invalidateQueries({ queryKey: ["/api/admin/publishers/rich-list"] });
    queryClient.invalidateQueries({ queryKey: ["/api/admin/publishers/summary"] });
  };

  const failToast = (fallback: string) => (error: Error) =>
    toast({ title: "خطأ", description: error.message || fallback, variant: "destructive" });

  const approveMutation = useMutation({
    mutationFn: async (id: string) =>
      apiRequest(`/api/admin/publishers/requests/${id}/close`, { method: "POST" }),
    onSuccess: () => {
      invalidate();
      toast({ title: "قُبل الطلب", description: "وأُبلغت الوكالة بالمعالجة" });
    },
    onError: failToast("فشل قبول الطلب"),
  });

  const rejectMutation = useMutation({
    mutationFn: async ({ id, note }: { id: string; note: string }) =>
      apiRequest(`/api/admin/publishers/requests/${id}/reject`, {
        method: "POST",
        body: JSON.stringify({ note: note || undefined }),
      }),
    onSuccess: () => {
      invalidate();
      setRejecting(null);
      setRejectNote("");
      toast({ title: "رُفض الطلب", description: "وصل السبب إلى الوكالة في إشعارها" });
    },
    onError: failToast("فشل رفض الطلب"),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) =>
      apiRequest(`/api/admin/publishers/requests/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      invalidate();
      setDeleting(null);
      toast({ title: "حُذف الطلب" });
    },
    onError: failToast("فشل حذف الطلب"),
  });

  const busy = approveMutation.isPending || rejectMutation.isPending || deleteMutation.isPending;

  return (
    <Card data-testid="card-publisher-requests">
      <CardContent className="p-4 sm:p-5">
        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2.5">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-amber-100 text-amber-700 dark:bg-amber-900/50 dark:text-amber-200">
              <BellRing className="h-4 w-4" aria-hidden="true" />
            </span>
            <div>
              <h2 className="font-bold leading-tight">طلبات الوكالات</h2>
              <p className="text-xs text-muted-foreground">
                {openCount > 0 ? `${formatNumber(openCount)} طلب بانتظار قرارك` : "لا طلبات معلقة"}
              </p>
            </div>
          </div>
          <Select value={statusTab} onValueChange={setStatusTab}>
            <SelectTrigger className="w-full sm:w-40" data-testid="select-request-status">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {STATUS_TABS.map((tab) => (
                <SelectItem key={tab.value} value={tab.value}>{tab.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {isLoading ? (
          <div className="space-y-2">
            {[1, 2].map((i) => <Skeleton key={i} className="h-16 w-full rounded-xl" />)}
          </div>
        ) : requests.length === 0 ? (
          <div className="rounded-xl border border-dashed py-10 text-center">
            <p className="text-sm text-muted-foreground">
              {statusTab === "open" ? "لا توجد طلبات مفتوحة" : "لا توجد طلبات في هذا السجل"}
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {requests.map((request) => {
              const statusMeta = STATUS_META[request.status] ?? STATUS_META.open;
              const isOpen = request.status === "open";

              return (
                <div
                  key={request.id}
                  className="flex flex-col gap-3 rounded-xl border bg-background/60 p-3 sm:flex-row sm:items-center"
                  data-testid={`request-row-${request.id}`}
                >
                  {request.logoUrl ? (
                    <img
                      src={request.logoUrl}
                      alt=""
                      className="h-9 w-9 shrink-0 rounded-lg border bg-white object-contain p-0.5"
                    />
                  ) : (
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border bg-muted">
                      <Building2 className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
                    </div>
                  )}

                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="truncate text-sm font-bold">{request.agencyName}</p>
                      <Badge variant="outline" className="shrink-0 text-[11px]">
                        {REQUEST_LABELS[request.type] ?? request.type}
                      </Badge>
                      {!isOpen && (
                        <Badge variant="outline" className={cn("shrink-0 text-[11px]", statusMeta.className)}>
                          {statusMeta.label}
                        </Badge>
                      )}
                    </div>
                    {request.message && (
                      <p className="mt-0.5 line-clamp-2 text-sm text-muted-foreground">{request.message}</p>
                    )}
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {formatRelativeTime(request.createdAt)}
                      {request.handledAt ? ` · عولج ${formatRelativeTime(request.handledAt)}` : ""}
                    </p>
                  </div>

                  <div className="flex shrink-0 items-center gap-1.5">
                    <Link href={`/dashboard/admin/publishers/${request.publisherId}`}>
                      <Button variant="outline" size="sm">فتح الوكالة</Button>
                    </Link>

                    {isOpen && (
                      <>
                        <Button
                          variant="outline"
                          size="sm"
                          className="gap-1 border-emerald-200 text-emerald-700 hover:bg-emerald-50 dark:border-emerald-900 dark:text-emerald-300"
                          onClick={() => approveMutation.mutate(request.id)}
                          disabled={busy}
                          data-testid={`button-approve-request-${request.id}`}
                        >
                          {approveMutation.isPending && approveMutation.variables === request.id ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <Check className="h-3.5 w-3.5" />
                          )}
                          قبول
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          className="gap-1 border-red-200 text-red-700 hover:bg-red-50 dark:border-red-900 dark:text-red-300"
                          onClick={() => {
                            setRejecting(request);
                            setRejectNote("");
                          }}
                          disabled={busy}
                          data-testid={`button-reject-request-${request.id}`}
                        >
                          <X className="h-3.5 w-3.5" />
                          رفض
                        </Button>
                      </>
                    )}

                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-muted-foreground hover:text-destructive"
                      onClick={() => setDeleting(request)}
                      disabled={busy}
                      title="حذف الطلب نهائياً"
                      data-testid={`button-delete-request-${request.id}`}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>

      <Dialog open={!!rejecting} onOpenChange={(open) => !open && setRejecting(null)}>
        <DialogContent dir="rtl" data-testid="dialog-reject-request">
          <DialogHeader>
            <DialogTitle>رفض الطلب</DialogTitle>
            <DialogDescription>
              سيصل إشعار «{rejecting?.agencyName}» بأن الطلب لم يُقبل. اكتب السبب ليصلهم معه.
            </DialogDescription>
          </DialogHeader>
          <Textarea
            value={rejectNote}
            onChange={(e) => setRejectNote(e.target.value)}
            placeholder="سبب الرفض (اختياري) — مثال: انتهى العقد السنوي، يُرجى التواصل مع القسم التجاري"
            rows={3}
            maxLength={500}
            dir="rtl"
            data-testid="input-reject-note"
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setRejecting(null)}>إلغاء</Button>
            <Button
              variant="destructive"
              onClick={() => rejecting && rejectMutation.mutate({ id: rejecting.id, note: rejectNote })}
              disabled={rejectMutation.isPending}
              data-testid="button-confirm-reject"
            >
              {rejectMutation.isPending ? "جاري الرفض..." : "رفض وإبلاغ الوكالة"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleting} onOpenChange={(open) => !open && setDeleting(null)}>
        <AlertDialogContent dir="rtl" data-testid="dialog-delete-request">
          <AlertDialogHeader>
            <AlertDialogTitle>حذف الطلب نهائياً؟</AlertDialogTitle>
            <AlertDialogDescription>
              سيُحذف طلب «{deleting?.agencyName}» من السجل بلا رجعة ولن يصل الوكالة أي إشعار.
              استخدم الحذف لطلبات التجربة فقط — للطلبات الحقيقية استخدم القبول أو الرفض.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>إلغاء</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleting && deleteMutation.mutate(deleting.id)}
              data-testid="button-confirm-delete-request"
            >
              حذف
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}
