// اهتماماتي ومقترحاتي — نموذج قصير لكاتب الرأي: الاسم والبريد من حسابه تلقائياً،
// مجالات الاهتمام (اختيار متعدد)، ومقترحاته للتطوير القادم. يستطيع تعديل رده لاحقاً.

import { useEffect, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Check, Loader2, Mail, MessageSquareHeart, User } from "lucide-react";
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

export default function WriterFeedbackPage() {
  const { toast } = useToast();
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

  const save = useMutation({
    mutationFn: () =>
      apiRequest("/api/opinion-writer-feedback/me", {
        method: "PUT",
        body: JSON.stringify({ interests, otherInterest, suggestions }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: MY_WRITER_FEEDBACK_KEY });
      toast({ title: "شكراً لك، وصلنا ردك", description: "يمكنك تعديله متى شئت من هذه الصفحة." });
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
