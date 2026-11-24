// اهتماماتي ومقترحاتي — نموذج قصير لكاتب الرأي: الاسم والبريد من حسابه تلقائياً،
// مجالات الاهتمام (اختيار متعدد)، ومقترحاته للتطوير القادم. يستطيع تعديل رده لاحقاً.

import { useEffect, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import {
  Check,
  CheckCircle2,
  Loader2,
  MessageSquareHeart,
} from "lucide-react";
import { WriterPageFrame, WriterSurface } from "@/components/writer/WriterPageFrame";
import { Button } from "@/components/ui/button";
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

  const chosenCount = interests.length;
  const savedAt = data?.feedback?.updatedAt
    ? new Date(data.feedback.updatedAt).toLocaleDateString("ar-SA-u-ca-gregory-nu-latn", { day: "numeric", month: "long" })
    : null;
  const fieldClass =
    "w-full rounded-[14px] border border-[#DCE4EC] bg-background px-4 text-[15px] outline-none focus:ring-2 focus:ring-[#1E9BE6] dark:border-border";

  return (
    <WriterPageFrame
      icon={MessageSquareHeart}
      title="اهتماماتي ومقترحاتي"
      description="دقيقة واحدة تساعدنا على التواصل معك حسب تخصصك، وعلى تطوير تجربة الكتابة في سبق."
      titleTestId="text-writer-feedback-title"
    >
      {isLoading ? (
        <WriterSurface className="flex items-center justify-center gap-2 py-12 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> جارٍ التحميل…
        </WriterSurface>
      ) : isError || !data ? (
        <WriterSurface className="py-10 text-center text-sm text-destructive">
          تعذر تحميل النموذج. حدّث الصفحة بعد قليل.
        </WriterSurface>
      ) : !data.isWriter ? (
        <WriterSurface className="py-10 text-center text-sm text-muted-foreground">هذا النموذج مخصص لكتّاب الرأي.</WriterSurface>
      ) : sentAt !== null ? (
        <WriterSurface className="flex flex-col items-center gap-3 px-6 py-12 text-center">
          <div role="status" data-testid="feedback-sent" className="flex flex-col items-center gap-3">
            <span className="grid h-16 w-16 place-items-center rounded-full bg-[#E6F4FD]">
              <CheckCircle2 className="h-9 w-9 text-[#1E9BE6]" aria-hidden="true" />
            </span>
            <h2 className="m-0 text-2xl font-bold">شكراً لك، وصلنا ردك</h2>
            <p className="m-0 max-w-md text-[15px] leading-7 text-[#55667A] dark:text-muted-foreground">
              سنتواصل معك حسب اهتماماتك، ونأخذ مقترحاتك في الحسبان. يمكنك تعديل ردك متى شئت من القائمة الجانبية.
            </p>
            <p className="m-0 text-[13px] text-[#55667A] dark:text-muted-foreground">نعيدك إلى صفحتك الرئيسية خلال {secondsLeft} ثوانٍ…</p>
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
          </div>
        </WriterSurface>
      ) : (
        <div className="flex flex-col gap-6 lg:flex-row lg:items-start">
          <form
            className="min-w-0 flex-1"
            onSubmit={(e) => {
              e.preventDefault();
              if (canSubmit) save.mutate();
            }}
          >
            <WriterSurface className="space-y-5 p-5 sm:p-6">
              <div className="space-y-3">
                <div>
                  <h2 className="text-base font-bold">مجالات اهتمامك</h2>
                  <p className="text-[13px] text-[#617183] dark:text-muted-foreground">اختر كل ما يناسبك، ويمكن اختيار أكثر من مجال.</p>
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
                          "inline-flex h-10 items-center gap-1.5 rounded-full px-4 text-sm transition-colors",
                          active
                            ? "bg-[#1E9BE6] font-semibold text-white"
                            : "bg-card text-foreground shadow-[inset_0_0_0_1px_#DCE4EC] hover:bg-[#F7F9FB]",
                        )}
                      >
                        {active && <Check className="h-3.5 w-3.5" />}
                        {item.label}
                      </button>
                    );
                  })}
                </div>
                {otherSelected && (
                  <input
                    value={otherInterest}
                    onChange={(e) => setOtherInterest(e.target.value)}
                    maxLength={MAX_OTHER_INTEREST_CHARS}
                    placeholder="اكتب المجال الآخر الذي تهتم به"
                    className={cn(fieldClass, "h-11")}
                    data-testid="input-other-interest"
                  />
                )}
              </div>

              <div className="h-px bg-[#EEF2F6] dark:bg-border" />

              <div className="space-y-2">
                <div>
                  <h2 className="text-base font-bold">مقترحاتك للتطوير القادم</h2>
                  <p className="text-[13px] text-[#617183] dark:text-muted-foreground">اختياري: ما الذي تود أن نضيفه أو نحسّنه لكتّاب الرأي؟</p>
                </div>
                <textarea
                  value={suggestions}
                  onChange={(e) => setSuggestions(e.target.value)}
                  maxLength={MAX_SUGGESTIONS_CHARS}
                  rows={5}
                  placeholder="مثلاً: ورشة عن الكتابة الرقمية، أو أداة تساعد في…"
                  className={cn(fieldClass, "resize-none py-3 leading-8")}
                  data-testid="textarea-suggestions"
                />
              </div>

              <div className="flex flex-wrap items-center gap-3">
                <button
                  type="submit"
                  disabled={!canSubmit}
                  className="inline-flex h-12 items-center gap-2 rounded-full bg-[#1E9BE6] px-6 text-[15px] font-semibold text-white shadow-[0_4px_14px_rgba(30,155,230,0.3)] hover:bg-[#178BD0] disabled:cursor-not-allowed disabled:opacity-50 disabled:shadow-none"
                  data-testid="button-submit-feedback"
                >
                  {save.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
                  {alreadySent ? "تحديث ردي" : "إرسال"}
                </button>
                {alreadySent && savedAt && (
                  <span className="text-[13px] text-[#13734E]">حُفظ ردك في {savedAt}</span>
                )}
              </div>
            </WriterSurface>
          </form>

          <div className="flex w-full shrink-0 flex-col gap-3 lg:w-[340px]">
            <span className="text-[13px] text-[#55667A] dark:text-muted-foreground">ما يصل إلى إدارة الرأي</span>
            <WriterSurface className="divide-y divide-[#EEF2F6] dark:divide-border">
              <div className="flex items-center justify-between gap-3 px-5 py-3.5">
                <span className="text-[13px] text-[#617183]">الاسم</span>
                <span className="truncate text-sm font-semibold" data-testid="text-feedback-name">{data.identity?.name ?? "—"}</span>
              </div>
              <div className="flex items-center justify-between gap-3 px-5 py-3.5">
                <span className="text-[13px] text-[#617183]">البريد</span>
                <span className="truncate text-sm font-semibold" dir="ltr" data-testid="text-feedback-email">{data.identity?.email ?? "—"}</span>
              </div>
              <div className="flex items-center justify-between gap-3 px-5 py-3.5">
                <span className="text-[13px] text-[#617183]">المجالات</span>
                <span className="text-sm font-semibold">{chosenCount === 0 ? "لم تختر بعد" : chosenCount === 1 ? "مجال واحد" : chosenCount === 2 ? "مجالان" : chosenCount <= 10 ? `${chosenCount} مجالات` : `${chosenCount} مجالًا`}</span>
              </div>
              <div className="flex items-center justify-between gap-3 px-5 py-3.5">
                <span className="text-[13px] text-[#617183]">مقترح</span>
                <span className="text-sm font-semibold">{suggestions.trim() ? "نعم" : "لا"}</span>
              </div>
            </WriterSurface>
            <span className="text-xs leading-6 text-[#617183] dark:text-muted-foreground">
              يصل ردك إلى إدارة مقالات الرأي فقط. اسمك وبريدك من حسابك تلقائيًا.
            </span>
          </div>
        </div>
      )}
    </WriterPageFrame>
  );
}
