// التحقق العام من خطاب رسمي — /verify/:code
// يعرض الحد الأدنى: الرقم، الاسم، الصفة، النوع، التاريخ، الحالة.
// لا رقم هوية ولا بيانات تواصل.

import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link, useRoute } from "wouter";
import { getQueryFn } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { CheckCircle2, FileText, ShieldAlert, ShieldCheck } from "lucide-react";
import { OFFICIAL_LETTER_BRAND_AR } from "@shared/officialLetters";

type VerifyResponse = {
  found: boolean;
  letter?: {
    referenceCode: string;
    letterTypeLabelAr: string;
    subjectName: string | null;
    roleTitleAr: string | null;
    recipientEntity: string | null;
    status: string;
    issuedAt: string;
    revokedAt: string | null;
  };
};

function formatDate(value: string | null | undefined): string {
  if (!value) return "—";
  try {
    return new Intl.DateTimeFormat("ar-SA-u-ca-gregory-nu-latn", {
      day: "numeric",
      month: "long",
      year: "numeric",
      timeZone: "Asia/Riyadh",
    }).format(new Date(value));
  } catch {
    return "—";
  }
}

export default function VerifyLetter() {
  const [, params] = useRoute("/verify/:code");
  const code = (params?.code ?? "").toUpperCase();

  const { data, isLoading } = useQuery<VerifyResponse>({
    queryKey: [`/api/official-letters/verify/${code}`],
    queryFn: getQueryFn<VerifyResponse>({ on401: "returnNull", silent: true }),
    enabled: Boolean(code),
    retry: false,
  });

  useEffect(() => {
    document.title = `التحقق من خطاب ${code} | سبق`;
  }, [code]);

  const letter = data?.found ? data.letter : undefined;
  const isRevoked = letter?.status === "revoked";

  return (
    <div dir="rtl" className="min-h-screen bg-muted/30 px-4 py-12">
      <div className="mx-auto w-full max-w-lg">
        <div className="rounded-2xl border bg-card p-6 shadow-sm sm:p-8">
          <div className="mb-6 flex items-center gap-3 border-b pb-5">
            <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <FileText className="h-5 w-5" aria-hidden="true" />
            </span>
            <div>
              <h1 className="text-lg font-bold tracking-tight">التحقق من خطاب رسمي</h1>
              <p className="text-xs text-muted-foreground">{OFFICIAL_LETTER_BRAND_AR}</p>
            </div>
          </div>

          {isLoading ? (
            <div className="space-y-3">
              <div className="h-5 w-1/2 animate-pulse rounded bg-muted" />
              <div className="h-24 animate-pulse rounded bg-muted" />
            </div>
          ) : !letter ? (
            <div className="py-8 text-center" data-testid="verify-not-found">
              <ShieldAlert className="mx-auto mb-3 h-10 w-10 text-destructive/70" />
              <p className="font-semibold">لا يوجد خطاب بهذا الرقم</p>
              <p className="mt-1 text-sm text-muted-foreground">
                تأكد من الرقم المرجعي المطبوع على الخطاب: <code>{code || "—"}</code>
              </p>
            </div>
          ) : (
            <div data-testid="verify-result">
              <div
                className={
                  isRevoked
                    ? "mb-5 flex items-center gap-2 rounded-xl border border-destructive/30 bg-destructive/5 px-4 py-3 text-destructive"
                    : "mb-5 flex items-center gap-2 rounded-xl border border-emerald-500/30 bg-emerald-500/5 px-4 py-3 text-emerald-700 dark:text-emerald-400"
                }
              >
                {isRevoked ? (
                  <ShieldAlert className="h-5 w-5 shrink-0" />
                ) : (
                  <ShieldCheck className="h-5 w-5 shrink-0" />
                )}
                <p className="text-sm font-semibold">
                  {isRevoked ? "هذه الشهادة ملغاة ولا يُعتد بها" : "شهادة صحيحة وصادرة من صحيفة سبق"}
                </p>
              </div>

              <dl className="divide-y rounded-xl border">
                {[
                  ["الرقم المرجعي", letter.referenceCode],
                  ["نوع الخطاب", letter.letterTypeLabelAr],
                  ["الاسم", letter.subjectName ?? "—"],
                  ["الصفة", letter.roleTitleAr ?? "—"],
                  ["الجهة", letter.recipientEntity ?? "لمن يهمه الأمر"],
                  ["تاريخ الإصدار", formatDate(letter.issuedAt)],
                  ...(isRevoked ? [["تاريخ الإلغاء", formatDate(letter.revokedAt)]] : []),
                ].map(([label, value]) => (
                  <div key={label} className="flex items-start justify-between gap-4 px-4 py-2.5">
                    <dt className="text-xs text-muted-foreground">{label}</dt>
                    <dd className="text-sm font-medium text-left">{value}</dd>
                  </div>
                ))}
              </dl>

              {!isRevoked && (
                <p className="mt-4 flex items-start gap-2 text-xs text-muted-foreground">
                  <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-600" />
                  هذه الصفحة تؤكد صدور الخطاب من الصحيفة. لأي استفسار تواصل معنا عبر الموقع.
                </p>
              )}
            </div>
          )}

          <div className="mt-6 border-t pt-4 text-center">
            <Button variant="ghost" size="sm" asChild>
              <Link href="/">العودة إلى سبق</Link>
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
