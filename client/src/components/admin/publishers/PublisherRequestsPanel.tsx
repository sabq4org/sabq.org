import { useState } from "react";
import { Link } from "wouter";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
import { formatDateShort, formatNumber, formatRelativeTime } from "@/lib/format";
import {
  monthsLabel,
  offerPackageLabel,
  offerPriceLabel,
  type RenewalOffer,
} from "@/components/publisher/PublisherRenewalCard";
import { cn } from "@/lib/utils";
import { BadgeCheck, BellRing, Building2, Check, Loader2, Send, Trash2, X } from "lucide-react";

interface PublisherRequest {
  id: string;
  type: string;
  message: string | null;
  status: string;
  createdAt: string;
  handledAt: string | null;
  adminNote: string | null;
  publisherId: string;
  agencyName: string;
  logoUrl: string | null;
  contactPerson?: string | null;
  email?: string | null;
  phoneNumber?: string | null;
  offer?: RenewalOffer | null;
  defaultStartDate?: string | null;
}

type OfferForm = {
  packageType: "unlimited" | "limited";
  totalCredits: string;
  durationMonths: string;
  startDate: string;
  price: string;
  validUntil: string;
  note: string;
};

const toDay = (iso: string | Date) => new Date(iso).toLocaleDateString("en-CA", { timeZone: "Asia/Riyadh" });

const REQUEST_LABELS: Record<string, string> = {
  renewal: "تجديد الباقة",
  window_extension: "تمديد فترة النشر",
  other: "طلب آخر",
};

const STATUS_TABS = [
  { value: "open", label: "مفتوحة" },
  { value: "offered", label: "عرض مُرسل" },
  { value: "accepted", label: "بانتظار الدفع" },
  { value: "closed", label: "مُعالجة" },
  { value: "rejected", label: "مرفوضة" },
];

const STATUS_META: Record<string, { label: string; className: string }> = {
  open: { label: "مفتوح", className: "border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200" },
  offered: { label: "عرض مُرسل", className: "border-sky-200 bg-sky-50 text-sky-800 dark:border-sky-900 dark:bg-sky-950/40 dark:text-sky-200" },
  accepted: { label: "قبلت العرض · بانتظار الدفع", className: "border-violet-200 bg-violet-50 text-violet-800 dark:border-violet-900 dark:bg-violet-950/40 dark:text-violet-200" },
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
  const [offering, setOffering] = useState<PublisherRequest | null>(null);
  const [offerForm, setOfferForm] = useState<OfferForm | null>(null);
  const [activating, setActivating] = useState<PublisherRequest | null>(null);

  const openOffer = (request: PublisherRequest) => {
    const prev = request.offer;
    const start = prev?.startDate ?? request.defaultStartDate ?? new Date().toISOString();
    setOffering(request);
    setOfferForm({
      packageType: prev?.packageType ?? "unlimited",
      totalCredits: prev?.totalCredits ? String(prev.totalCredits) : "",
      durationMonths: String(prev?.durationMonths ?? 12),
      startDate: toDay(start),
      price: prev?.price !== null && prev?.price !== undefined ? String(prev.price) : "",
      validUntil: toDay(new Date(Date.now() + 14 * 86_400_000)),
      note: prev?.note ?? "",
    });
  };

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

  const offerMutation = useMutation({
    mutationFn: async ({ request, form }: { request: PublisherRequest; form: OfferForm }) => {
      const defaultStart = request.offer?.startDate ?? request.defaultStartDate ?? null;
      // البداية الافتراضية لحظة انتهاء الباقة الحالية بالضبط؛ لا نقرّبها لبداية اليوم
      const startDate =
        defaultStart && toDay(defaultStart) === form.startDate
          ? new Date(defaultStart).toISOString()
          : new Date(`${form.startDate}T00:00:00+03:00`).toISOString();
      return apiRequest<{ message: string }>(`/api/admin/publishers/requests/${request.id}/offer`, {
        method: "POST",
        body: JSON.stringify({
          packageType: form.packageType,
          totalCredits: form.packageType === "limited" ? Number(form.totalCredits) || null : null,
          durationMonths: Number(form.durationMonths) || 12,
          startDate,
          price: form.price.trim() === "" ? null : Number(form.price),
          currency: "SAR",
          validUntil: new Date(`${form.validUntil}T23:59:59+03:00`).toISOString(),
          note: form.note.trim() || null,
        }),
      });
    },
    onSuccess: (result) => {
      invalidate();
      setOffering(null);
      setOfferForm(null);
      toast({ title: "أُرسل العرض", description: result?.message });
    },
    onError: failToast("فشل إرسال العرض"),
  });

  const activateMutation = useMutation({
    mutationFn: async (id: string) =>
      apiRequest<{ message: string }>(`/api/admin/publishers/requests/${id}/activate`, { method: "POST" }),
    onSuccess: (result) => {
      invalidate();
      setActivating(null);
      toast({ title: "فُعّلت الباقة", description: result?.message });
    },
    onError: failToast("فشل تفعيل الباقة"),
  });

  const busy = offerMutation.isPending || activateMutation.isPending || approveMutation.isPending || rejectMutation.isPending || deleteMutation.isPending;

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
              const isRenewal = request.type === "renewal";
              const canOffer = isRenewal && (request.status === "open" || request.status === "offered");
              const offer = request.offer ?? null;

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
                    {offer && (
                      <p className="mt-1 text-xs text-foreground/80" data-testid={`request-offer-${request.id}`}>
                        <span className="text-muted-foreground">العرض:</span> {offerPackageLabel(offer)} ·{" "}
                        {monthsLabel(offer.durationMonths)} · {offerPriceLabel(offer)} · يبدأ {formatDateShort(offer.startDate)}
                        {offer.response === "contact" ? " · طلبت الوكالة التواصل" : ""}
                      </p>
                    )}
                    {(request.contactPerson || request.phoneNumber) && (request.status === "offered" || request.status === "accepted") && (
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        {[request.contactPerson, request.phoneNumber, request.email].filter(Boolean).join(" · ")}
                      </p>
                    )}
                    {request.adminNote && (
                      <p className="mt-1 text-xs text-foreground/80">
                        <span className="text-muted-foreground">ردّ الإدارة:</span> {request.adminNote}
                      </p>
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

                    {canOffer && (
                      <Button
                        size="sm"
                        className="gap-1"
                        onClick={() => openOffer(request)}
                        disabled={busy}
                        data-testid={`button-offer-request-${request.id}`}
                      >
                        <Send className="h-3.5 w-3.5" />
                        {request.status === "offered" ? "تعديل العرض" : "إرسال عرض"}
                      </Button>
                    )}
                    {request.status === "accepted" && isRenewal && (
                      <Button
                        size="sm"
                        className="gap-1 bg-emerald-600 hover:bg-emerald-700"
                        onClick={() => setActivating(request)}
                        disabled={busy}
                        data-testid={`button-activate-request-${request.id}`}
                      >
                        <BadgeCheck className="h-3.5 w-3.5" />
                        تأكيد الدفع وتفعيل الباقة
                      </Button>
                    )}
                    {(isOpen || request.status === "offered" || request.status === "accepted") && (
                      <>
                        {isOpen && !isRenewal && (
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
                        )}
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

      <Dialog
        open={!!offering && !!offerForm}
        onOpenChange={(open) => {
          if (!open) {
            setOffering(null);
            setOfferForm(null);
          }
        }}
      >
        <DialogContent dir="rtl" className="max-w-lg" data-testid="dialog-renewal-offer">
          <DialogHeader>
            <DialogTitle>عرض تجديد لـ«{offering?.agencyName}»</DialogTitle>
            <DialogDescription>
              يصل العرض للوكالة بالبريد وفي لوحتها، فتقبله أو تطلب التواصل. الفواتير والدفع خارج النظام.
            </DialogDescription>
          </DialogHeader>
          {offerForm && (
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label>نوع الباقة</Label>
                <Select
                  value={offerForm.packageType}
                  onValueChange={(v) => setOfferForm({ ...offerForm, packageType: v as OfferForm["packageType"] })}
                >
                  <SelectTrigger data-testid="select-offer-type">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="unlimited">مفتوحة بلا حد</SelectItem>
                    <SelectItem value="limited">محدودة بعدد أخبار</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {offerForm.packageType === "limited" ? (
                <div className="space-y-1.5">
                  <Label htmlFor="offer-credits">عدد الأخبار</Label>
                  <Input
                    id="offer-credits"
                    type="number"
                    min={1}
                    value={offerForm.totalCredits}
                    onChange={(e) => setOfferForm({ ...offerForm, totalCredits: e.target.value })}
                    data-testid="input-offer-credits"
                  />
                </div>
              ) : (
                <div className="hidden sm:block" />
              )}
              <div className="space-y-1.5">
                <Label htmlFor="offer-months">المدة بالأشهر</Label>
                <Input
                  id="offer-months"
                  type="number"
                  min={1}
                  max={36}
                  value={offerForm.durationMonths}
                  onChange={(e) => setOfferForm({ ...offerForm, durationMonths: e.target.value })}
                  data-testid="input-offer-months"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="offer-start">تبدأ</Label>
                <Input
                  id="offer-start"
                  type="date"
                  value={offerForm.startDate}
                  onChange={(e) => setOfferForm({ ...offerForm, startDate: e.target.value })}
                  data-testid="input-offer-start"
                />
                <p className="text-[11px] text-muted-foreground">الافتراضي: لحظة انتهاء الباقة الحالية</p>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="offer-price">السعر (ر.س)</Label>
                <Input
                  id="offer-price"
                  type="number"
                  min={0}
                  value={offerForm.price}
                  onChange={(e) => setOfferForm({ ...offerForm, price: e.target.value })}
                  placeholder="اختياري"
                  data-testid="input-offer-price"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="offer-valid">العرض صالح حتى</Label>
                <Input
                  id="offer-valid"
                  type="date"
                  value={offerForm.validUntil}
                  onChange={(e) => setOfferForm({ ...offerForm, validUntil: e.target.value })}
                  data-testid="input-offer-valid"
                />
              </div>
              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor="offer-note">ملاحظة للوكالة</Label>
                <Textarea
                  id="offer-note"
                  rows={2}
                  maxLength={1000}
                  value={offerForm.note}
                  onChange={(e) => setOfferForm({ ...offerForm, note: e.target.value })}
                  placeholder="مثال: نفس شروط الباقة الحالية مع تقرير شهري مفصل"
                  data-testid="input-offer-note"
                />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setOffering(null);
                setOfferForm(null);
              }}
            >
              إلغاء
            </Button>
            <Button
              onClick={() => offering && offerForm && offerMutation.mutate({ request: offering, form: offerForm })}
              disabled={
                offerMutation.isPending ||
                !offerForm?.validUntil ||
                !offerForm?.startDate ||
                (offerForm?.packageType === "limited" && !(Number(offerForm.totalCredits) > 0))
              }
              data-testid="button-send-offer"
            >
              {offerMutation.isPending ? "جاري الإرسال..." : "أرسل العرض"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!activating} onOpenChange={(open) => !open && setActivating(null)}>
        <AlertDialogContent dir="rtl" data-testid="dialog-activate-renewal">
          <AlertDialogHeader>
            <AlertDialogTitle>تأكيد الدفع وتفعيل الباقة؟</AlertDialogTitle>
            <AlertDialogDescription>
              {activating?.offer
                ? `ستُنشأ لـ«${activating.agencyName}» باقة ${offerPackageLabel(activating.offer)} لمدة ${monthsLabel(activating.offer.durationMonths)} تبدأ ${formatDateShort(activating.offer.startDate)} بسعر ${offerPriceLabel(activating.offer)}، ويُغلق الطلب وتُبلغ الوكالة.`
                : "ستُنشأ الباقة الجديدة ويُغلق الطلب."}{" "}
              فعّل فقط بعد التأكد من وصول الدفع.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>إلغاء</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => activating && activateMutation.mutate(activating.id)}
              data-testid="button-confirm-activate"
            >
              تأكيد وتفعيل
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

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
