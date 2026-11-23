// اهتماماتي ومقترحاتي — نموذج قصير لكاتب الرأي: الاسم والبريد من حسابه تلقائياً،
// مجالات الاهتمام (اختيار متعدد)، ومقترحاته للتطوير القادم. يستطيع تعديل رده لاحقاً.

import { useEffect, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { Check, CheckCircle2, Loader2, Mail, MessageSquareHeart, User } from "lucide-react";
import { DashboardLayout } from "@/components/DashboardLayout";
import { DashboardPageShell } from "@/components/dashboard/DashboardPageShell";
import { DashboardPageHeader } from "@/components/dashboard/DashboardPageHeader";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { cn } from "@/lib/utils";
import {
  MAX_OTHER_INTEREST_CHARS,
  MAX_SUGGESTIONS_CHARS,
  OPINION_WRITER_INTERESTS,
  type OpinionWriterInterestId,
} from "@shared/opinionWriterFeedback";

export type MyWriterFeedbackResponse = {
  isWriter: boolean;
  identity: { name: string; email: string | null } | null;
  feedback: {
    interests: string[];
    otherInterest: string | null;
    suggestions: string | null;
    updatedAt: string;
  } | null;
};

export const MY_WRITER_FEEDBACK_KEY = ["/api/opinion-writer-feedback/me"];

const WRITER_HOME_PATH = "/dashboard/opinion-author";
const RETURN_HOME_SECONDS = 4;

export default function WriterFeedbackPage() {
  const { toast } = useToast();
  const [, navigate] = useLocation();
  // بعد الحفظ تظهر شاشة شكر، ثم يعود الكاتب إلى صفحته الرئيسية تلقائياً
  const [sentAt, setSentAt] = useState<number | null>(null);
  const [secondsLeft, setSecondsLeft] = useState(RETURN_HOME_SECONDS);
  const { data, isLoading, isError } = useQuery<MyWriterFeedbackResponse | null>({
    queryKey: MY_WRITER_FEEDBACK_KEY,
    staleTime: 30_000,
  });

  const [interests, setInterests] = useState<OpinionWriterInterestId[]>([]);
  const [otherInterest, setOtherInterest] = useState("");
  const [suggestions, setSuggestions] = useState("");
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    if (hydrated || !data) return;
    const saved = data.feedback;
    if (saved) {
      setInterests(saved.interests as OpinionWriterInterestId[]);
      setOtherInterest(saved.otherInterest ?? "");
      setSuggestions(saved.suggestions ?? "");
    }
    setHydrated(true);
  }, [data, hydrated]);

  useEffect(() => {
    if (sentAt === null) return;
    setSecondsLeft(RETURN_HOME_SECONDS);
    const tick = window.setInterval(() => setSecondsLeft((n) => Math.max(0, n - 1)), 1000);
    const go = window.setTimeout(() => navigate(WRITER_HOME_PATH), RETURN_HOME_SECONDS * 1000);
    return () => {
      window.clearInterval(tick);
      window.clearTimeout(go);
    };
  }, [sentAt, navigate]);

  const save = useMutation({
    mutationFn: () =>
      apiRequest("/api/opinion-writer-feedback/me", {
        method: "PUT",
        body: JSON.stringify({
          interests,
          otherInterest: interests.includes("other") ? otherInterest : null,
          suggestions,
        }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: MY_WRITER_FEEDBACK_KEY });
      setSentAt(Date.now());
    },
    onError: (error: unknown) => {
      const message = error instanceof Error ? error.message : "";
      toast({ title: "تعذر حفظ ردك", description: message || "حاول مرة أخرى بعد قليل", variant: "destructive" });
    },
  });

  const toggle = (id: OpinionWriterInterestId) =>
    setInterests((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));

  const otherSelected = interests.includes("other");
  const canSubmit =
    interests.length > 0 && (!otherSelected || otherInterest.trim().length > 0) && !save.isPending;
  const alreadySent = Boolean(data?.feedback);

  return (
    <DashboardLayout>
      <DashboardPageShell maxWidthClassName="max-w-2xl" contentClassName="px-4 pb-16 sm:px-6">
        <DashboardPageHeader
          icon={MessageSquareHeart}
          title="اهتماماتي ومقترحاتي"
          description="دقيقة واحدة تساعدنا على التواصل معك حسب تخصصك، وعلى تطوير تجربة الكتابة في سبق"
          titleTestId="text-writer-feedback-title"
        />

        <div dir="rtl">
          {isLoading ? (
            <Card>
              <CardContent className="flex items-center justify-center gap-2 py-12 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                جارٍ التحميل…
              </CardContent>
            </Card>
          ) : isError || !data ? (
            <Card>
              <CardContent className="py-10 text-center text-sm text-destructive">
                تعذر تحميل النموذج حالياً. حاول تحديث الصفحة بعد قليل.
              </CardContent>
            </Card>
          ) : !data.isWriter ? (
            <Card>
              <CardContent className="py-10 text-center text-sm text-muted-foreground">
                هذا النموذج مخصص لكتّاب الرأي.
              </CardContent>
            </Card>
          ) : sentAt !== null ? (
            <section
              className="flex flex-col items-center gap-3 rounded-[22px] bg-white px-6 py-12 text-center shadow-[0_1px_3px_rgba(27,43,58,0.06)]"
              role="status"
              data-testid="feedback-sent"
            >
              <span className="grid h-16 w-16 place-items-center rounded-full bg-[#E6F4FD]">
                <CheckCircle2 className="h-9 w-9 text-[#1E9BE6]" aria-hidden="true" />
              </span>
              <h2 className="m-0 text-2xl font-bold text-[#1B2B3A]">شكراً لك، وصلنا ردك</h2>
              <p className="m-0 max-w-md text-[15px] leading-7 text-[#55667A]">
                سنتواصل معك حسب اهتماماتك، ونأخذ مقترحاتك في الحسبان. يمكنك تعديل ردك متى شئت من القائمة الجانبية.
              </p>
              <p className="m-0 text-[13px] text-[#55667A]">نعيدك إلى صفحتك الرئيسية خلال {secondsLeft} ثوانٍ…</p>
              <div className="mt-2 flex flex-wrap justify-center gap-2">
                <Button
                  type="button"
                  className="h-11 rounded-full bg-[#1E9BE6] px-6 font-bold text-white hover:bg-[#1789CE]"
                  onClick={() => navigate(WRITER_HOME_PATH)}
                  data-testid="button-feedback-home"
                >
                  العودة إلى الرئيسية الآن
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  className="h-11 rounded-full px-5 text-[#0B6FA8]"
                  onClick={() => setSentAt(null)}
                  data-testid="button-feedback-edit"
                >
                  تعديل ردي
                </Button>
              </div>
            </section>
          ) : (
            <form
              className="space-y-6"
              onSubmit={(e) => {
                e.preventDefault();
                if (canSubmit) save.mutate();
              }}
            >
              <section className="rounded-2xl border border-border bg-card p-4 sm:p-5">
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="flex items-center gap-2.5 rounded-xl bg-muted/50 px-3 py-2.5">
                    <User className="h-4 w-4 shrink-0 text-primary" />
                    <div className="min-w-0">
                      <p className="text-[11px] text-muted-foreground">الاسم</p>
                      <p className="truncate text-sm font-semibold" data-testid="text-feedback-name">
                        {data.identity?.name ?? "—"}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2.5 rounded-xl bg-muted/50 px-3 py-2.5">
                    <Mail className="h-4 w-4 shrink-0 text-primary" />
                    <div className="min-w-0">
                      <p className="text-[11px] text-muted-foreground">البريد</p>
                      <p className="truncate text-sm font-semibold" dir="ltr" style={{ textAlign: "right" }} data-testid="text-feedback-email">
                        {data.identity?.email ?? "—"}
                      </p>
                    </div>
                  </div>
                </div>
                <p className="mt-2 text-[11px] text-muted-foreground">يظهران تلقائياً من حسابك ولا يحتاجان إلى تعديل.</p>
              </section>

              <section className="space-y-3">
                <div>
                  <h2 className="text-base font-bold">مجالات اهتمامك</h2>
                  <p className="text-xs text-muted-foreground">اختر كل ما يناسبك، ويمكن اختيار أكثر من مجال.</p>
                </div>
                <div className="flex flex-wrap gap-2" role="group" aria-label="مجالات الاهتمام">
                  {OPINION_WRITER_INTERESTS.map((item) => {
                    const active = interests.includes(item.id);
                    return (
                      <button
                        key={item.id}
                        type="button"
                        aria-pressed={active}
                        onClick={() => toggle(item.id)}
                        data-testid={`chip-interest-${item.id}`}
                        className={cn(
                          "inline-flex min-h-10 items-center gap-1.5 rounded-full border px-3.5 text-sm font-medium transition-colors",
                          active
                            ? "border-primary bg-primary text-primary-foreground"
                            : "border-border bg-card text-foreground hover:border-primary/50 hover:bg-primary/5",
                        )}
                      >
                        {active && <Check className="h-3.5 w-3.5" />}
                        {item.label}
                      </button>
                    );
                  })}
                </div>
                {otherSelected && (
                  <Input
                    value={otherInterest}
                    onChange={(e) => setOtherInterest(e.target.value)}
                    maxLength={MAX_OTHER_INTEREST_CHARS}
                    placeholder="اكتب المجال الآخر الذي تهتم به"
                    data-testid="input-other-interest"
                  />
                )}
              </section>

              <section className="space-y-2">
                <div>
                  <h2 className="text-base font-bold">مقترحاتك للتطوير القادم</h2>
                  <p className="text-xs text-muted-foreground">اختياري: ما الذي تود أن نضيفه أو نحسّنه لكتّاب الرأي؟</p>
                </div>
                <Textarea
                  value={suggestions}
                  onChange={(e) => setSuggestions(e.target.value)}
                  maxLength={MAX_SUGGESTIONS_CHARS}
                  rows={5}
                  placeholder="مثلاً: ورشة عن الكتابة الرقمية، أو أداة تساعد في…"
                  data-testid="textarea-suggestions"
                />
              </section>

              <div className="flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-xs text-muted-foreground">
                  {alreadySent ? "وصلنا ردك سابقاً، وأي تعديل يُحفظ مكانه." : "يصل ردك إلى إدارة مقالات الرأي فقط."}
                </p>
                <Button type="submit" disabled={!canSubmit} className="gap-1.5 font-bold" data-testid="button-submit-feedback">
                  {save.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
                  {alreadySent ? "تحديث ردي" : "إرسال"}
                </Button>
              </div>
            </form>
          )}
        </div>
      </DashboardPageShell>
    </DashboardLayout>
  );
}
