import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CalendarClock, CheckCircle2, Phone, RefreshCw, Send } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { formatDateShort, formatNumber } from "@/lib/format";
import { cn } from "@/lib/utils";
import { PublisherRequestDialog } from "./PublisherRequestDialog";

export interface RenewalOffer {
  packageType: "unlimited" | "limited";
  totalCredits: number | null;
  durationMonths: number;
  startDate: string;
  price: number | null;
  currency: string;
  validUntil: string;
  note: string | null;
  sentAt: string;
  response?: "accepted" | "contact";
  respondedAt?: string;
}

export interface PortalRenewal {
  current: {
    id: string;
    packageName: string;
    isUnlimited: boolean;
    startDate: string;
    expiryDate: string | null;
    daysLeft: number | null;
  } | null;
  upcoming: {
    id: string;
    packageName: string;
    isUnlimited: boolean;
    startDate: string;
    expiryDate: string | null;
  } | null;
  due: boolean;
  milestones: number[];
  request: {
    id: string;
    status: "open" | "offered" | "accepted";
    createdAt: string;
    message: string | null;
    offer: RenewalOffer | null;
  } | null;
}

export const monthsLabel = (n: number) => `${formatNumber(n)} ${n >= 3 && n <= 10 ? "أشهر" : n === 1 ? "شهر" : "شهرًا"}`;
export const daysLabel = (n: number) => `${formatNumber(n)} ${n >= 3 && n <= 10 ? "أيام" : n === 1 ? "يوم" : "يومًا"}`;

export function offerPackageLabel(offer: RenewalOffer) {
  return offer.packageType === "unlimited" ? "مفتوحة بلا حد" : `${formatNumber(offer.totalCredits ?? 0)} خبر`;
}

export function offerPriceLabel(offer: RenewalOffer) {
  if (offer.price === null || offer.price === undefined) return "—";
  return `${formatNumber(offer.price)} ${offer.currency === "SAR" ? "ر.س" : offer.currency}`;
}

type StepState = "done" | "current" | "todo";

function Step({ index, title, hint, state }: { index: number; title: string; hint: string; state: StepState }) {
  return (
    <li
      className={cn(
        "flex min-w-0 flex-col gap-0.5 rounded-xl px-3 py-2.5 text-xs",
        state === "done" && "bg-emerald-50 text-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-200",
        state === "current" && "bg-sky-50 text-sky-900 ring-1 ring-sky-200 dark:bg-sky-950/40 dark:text-sky-100 dark:ring-sky-900",
        state === "todo" && "bg-muted/50 text-muted-foreground",
      )}
      aria-current={state === "current" ? "step" : undefined}
    >
      <span className="text-sm font-semibold">
        {index}. {title}
      </span>
      <span>{hint}</span>
    </li>
  );
}

/**
 * بطاقة التجديد في لوحة الوكالة: مراحل التجديد الخمس، والعرض بالسعر،
 * وزر الطلب حين تدخل الباقة نافذة التنبيه. لا تظهر إن لم يكن هناك ما يُقال.
 */
export function PublisherRenewalCard({
  className,
  onlyWithRequest = false,
}: {
  className?: string;
  /** في الرئيسية: تظهر البطاقة فقط حين يكون هناك طلب جارٍ (التنبيه نفسه في «ما يحتاجك») */
  onlyWithRequest?: boolean;
}) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [requestOpen, setRequestOpen] = useState(false);

  const { data } = useQuery<PortalRenewal>({ queryKey: ["/api/publisher/portal/renewal"] });

  const respond = useMutation({
    mutationFn: async (vars: { id: string; response: "accepted" | "contact" }) =>
      apiRequest<{ message: string }>(`/api/publisher/portal/requests/${vars.id}/respond`, {
        method: "POST",
        body: JSON.stringify({ response: vars.response }),
      }),
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ["/api/publisher/portal/renewal"] });
      queryClient.invalidateQueries({ queryKey: ["/api/publisher/portal/requests"] });
      queryClient.invalidateQueries({ queryKey: ["/api/publisher/portal/overview"] });
      toast({ title: "وصل ردكم", description: result?.message });
    },
    onError: (error: Error) => {
      toast({ title: "تعذر إرسال الرد", description: error.message, variant: "destructive" });
    },
  });

  if (!data) return null;
  const { current, upcoming, request } = data;
  if (onlyWithRequest && !request) return null;
  const offer = request?.offer ?? null;

  // باقة لاحقة مفعلة: التجديد اكتمل
  if (upcoming && !request) {
    return (
      <Card className={cn("border-emerald-200 shadow-sm dark:border-emerald-900", className)} data-testid="card-renewal-done">
        <CardContent className="flex flex-wrap items-center gap-3 py-4 text-sm">
          <CheckCircle2 className="h-5 w-5 text-emerald-600" aria-hidden />
          <span>
            جُددت باقتكم: «{upcoming.packageName}» تبدأ في {formatDateShort(upcoming.startDate)}
            {upcoming.expiryDate ? ` وتنتهي في ${formatDateShort(upcoming.expiryDate)}` : ""}.
          </span>
        </CardContent>
      </Card>
    );
  }
  if (!data.due && !request) return null;

  const status = request?.status ?? null;
  const steps: Array<{ title: string; hint: string; state: StepState }> = [
    {
      title: "التنبيه",
      hint: current?.expiryDate ? `تنتهي ${formatDateShort(current.expiryDate)}` : "بريد ولوحة",
      state: "done",
    },
    {
      title: "طلبكم",
      hint: request ? `أُرسل ${formatDateShort(request.createdAt)}` : "بضغطة واحدة",
      state: request ? "done" : "current",
    },
    {
      title: "عرض سبق",
      hint:
        status === "offered"
          ? offer?.response === "contact"
            ? "طلبتم التواصل"
            : "بانتظار ردكم"
          : status === "accepted"
            ? "قبلتموه"
            : "يصلكم بالبريد",
      state: status === "accepted" ? "done" : status === "open" || status === "offered" ? "current" : "todo",
    },
    { title: "الدفع", hint: "مع فريق سبق", state: status === "accepted" ? "current" : "todo" },
    {
      title: "التفعيل",
      hint: offer ? `يبدأ ${formatDateShort(offer.startDate)}` : "فور انتهاء الحالية",
      state: "todo",
    },
  ];

  const offerExpired = offer ? new Date(offer.validUntil).getTime() + 86_400_000 < Date.now() : false;

  return (
    <Card className={cn("border-border/60 shadow-sm", className)} data-testid="card-renewal">
      <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2 pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <span className="rounded-lg bg-sky-500/10 p-1.5 text-sky-600 dark:text-sky-300">
            <RefreshCw className="h-4 w-4" />
          </span>
          تجديد الباقة
        </CardTitle>
        {current?.daysLeft !== null && current?.daysLeft !== undefined ? (
          <Badge
            variant="outline"
            className={cn(
              "border-0",
              current.daysLeft <= 7
                ? "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-200"
                : "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200",
            )}
          >
            <CalendarClock className="ml-1 h-3 w-3" />
            تنتهي بعد {daysLabel(current.daysLeft)}
          </Badge>
        ) : null}
      </CardHeader>
      <CardContent className="space-y-4">
        <ol className="grid grid-cols-2 gap-2 sm:grid-cols-5">
          {steps.map((step, i) => (
            <Step key={step.title} index={i + 1} {...step} />
          ))}
        </ol>

        {!request && (
          <div className="flex flex-col gap-3 rounded-xl border border-amber-200 bg-amber-50/70 p-4 text-sm text-amber-950 sm:flex-row sm:items-center dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-100">
            <p className="flex-1 leading-relaxed">
              {current
                ? `«${current.packageName}» تنتهي في ${current.expiryDate ? formatDateShort(current.expiryDate) : "—"}. اطلبوا التجديد الآن، ويصلكم عرض سبق بالبريد وهنا.`
                : "اطلبوا التجديد، ويصلكم عرض سبق بالبريد وهنا."}
            </p>
            <Button className="shrink-0 gap-2" onClick={() => setRequestOpen(true)} data-testid="button-renewal-request">
              <Send className="h-4 w-4" />
              اطلب التجديد
            </Button>
          </div>
        )}

        {status === "open" && (
          <p className="rounded-xl bg-muted/50 px-4 py-3 text-sm text-muted-foreground">
            وصل طلبكم لفريق سبق، وسيصلكم عرض التجديد بالبريد وفي هذه الصفحة.
          </p>
        )}

        {offer && (status === "offered" || status === "accepted") && (
          <div className="space-y-3 rounded-xl border border-sky-200 p-4 dark:border-sky-900" data-testid="renewal-offer">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="font-semibold">عرض التجديد من سبق</p>
              <Badge
                variant="outline"
                className={cn(
                  "border-0",
                  offerExpired
                    ? "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-200"
                    : "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200",
                )}
              >
                {offerExpired ? "انتهت صلاحية العرض" : `صالح حتى ${formatDateShort(offer.validUntil)}`}
              </Badge>
            </div>
            <dl className="grid grid-cols-2 gap-2 text-sm md:grid-cols-4">
              {[
                ["الباقة", offerPackageLabel(offer)],
                ["المدة", monthsLabel(offer.durationMonths)],
                ["تبدأ", formatDateShort(offer.startDate)],
                ["السعر", offerPriceLabel(offer)],
              ].map(([label, value]) => (
                <div key={label} className="rounded-lg bg-muted/50 px-3 py-2">
                  <dt className="text-xs text-muted-foreground">{label}</dt>
                  <dd className="font-semibold tabular-nums">{value}</dd>
                </div>
              ))}
            </dl>
            {offer.note ? <p className="text-sm text-muted-foreground">ملاحظة الإدارة: {offer.note}</p> : null}

            {status === "offered" ? (
              <div className="flex flex-wrap gap-2">
                <Button
                  disabled={respond.isPending || offerExpired}
                  onClick={() => respond.mutate({ id: request!.id, response: "accepted" })}
                  data-testid="button-offer-accept"
                >
                  <CheckCircle2 className="ml-1.5 h-4 w-4" />
                  أقبل العرض
                </Button>
                <Button
                  variant="outline"
                  disabled={respond.isPending || offer.response === "contact"}
                  onClick={() => respond.mutate({ id: request!.id, response: "contact" })}
                  data-testid="button-offer-contact"
                >
                  <Phone className="ml-1.5 h-4 w-4" />
                  {offer.response === "contact" ? "طلبتم التواصل" : "أريد التواصل"}
                </Button>
              </div>
            ) : (
              <p className="text-sm text-emerald-700 dark:text-emerald-300">
                قبلتم العرض. يتواصل معكم فريق سبق لإتمام الدفع، وتُفعَّل الباقة بعد تأكيده لتبدأ فور انتهاء الحالية.
              </p>
            )}
          </div>
        )}
      </CardContent>

      <PublisherRequestDialog
        open={requestOpen}
        onOpenChange={(open) => {
          setRequestOpen(open);
          if (!open) queryClient.invalidateQueries({ queryKey: ["/api/publisher/portal/renewal"] });
        }}
        defaultType="renewal"
      />
    </Card>
  );
}
