// لوحة الكاتب في محرر مقال الرأي: «جملة المقال» لبطاقة المشاركة، وتفعيل
// «أوافق / لا أوافق» في نهاية المقال. تحفظ بمسارها الخاص (/api/opinion-extras)
// فلا تمس حفظ المقال ولا الحفظ التلقائي. قبل أول حفظ للمسودة تبقى القيم معلّقة
// وتُرسل تلقائيًا حين يحصل المقال على رقمه.
import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Check, Quote, Vote } from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import {
  OPINION_WRITER_CARD_SUBTITLE,
  PULL_QUOTE_MAX_CHARS,
  normalizePullQuote,
  pullQuoteAppearsInArticle,
  validatePullQuote,
} from "@shared/opinionReaderExtras";
import { opinionExtrasKey, type OpinionExtrasView } from "./opinionExtrasApi";
import { QuoteMark } from "./QuoteMark";

export function OpinionExtrasEditorPanel({
  articleId,
  content,
  authorName,
  className,
}: {
  articleId?: string;
  /** نص المقال للتحقق أن العبارة منه؛ يُترك فارغًا خارج المحرر. */
  content?: string;
  authorName?: string;
  className?: string;
}) {
  const { toast } = useToast();
  const { data } = useQuery<OpinionExtrasView | null>({
    queryKey: opinionExtrasKey(articleId ?? ""),
    enabled: Boolean(articleId),
    retry: false,
  });
  const [quote, setQuote] = useState("");
  const [agreeOn, setAgreeOn] = useState(false);
  const [dirty, setDirty] = useState(false);
  const loadedFor = useRef<string | null>(null);

  useEffect(() => {
    if (!data || loadedFor.current === data.articleId) return;
    loadedFor.current = data.articleId;
    if (!dirty) {
      setQuote(data.pullQuote ?? "");
      setAgreeOn(data.agreeVoteEnabled);
    }
  }, [data, dirty]);

  const validation = validatePullQuote(quote);
  const inArticle = useMemo(
    () => content === undefined || !quote.trim() || pullQuoteAppearsInArticle(quote, content),
    [quote, content],
  );
  const length = Array.from(normalizePullQuote(quote)).length;

  const save = useMutation({
    mutationFn: () =>
      apiRequest(`/api/opinion-extras/${articleId}`, {
        method: "PUT",
        body: JSON.stringify({ pullQuote: quote.trim() ? quote : null, agreeVoteEnabled: agreeOn }),
      }),
    onSuccess: () => {
      setDirty(false);
      queryClient.invalidateQueries({ queryKey: opinionExtrasKey(articleId ?? "") });
      toast({ title: "حُفظت إضافات المقال" });
    },
    onError: (err: unknown) =>
      toast({ title: "تعذر الحفظ", description: err instanceof Error ? err.message : undefined, variant: "destructive" }),
  });

  // مقال جديد: أول ما يحصل على رقمه من الحفظ التلقائي نرسل ما اختاره الكاتب
  useEffect(() => {
    if (articleId && dirty && validation.ok && !save.isPending && loadedFor.current === articleId) save.mutate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [articleId, data]);

  const canSave = Boolean(articleId) && dirty && validation.ok && !save.isPending;

  return (
    <section
      dir="rtl"
      className={cn("rounded-[22px] border border-[#EEF2F6] bg-white p-4 sm:p-5", className)}
      data-testid="opinion-extras-panel"
    >
      <div className="flex items-center gap-2">
        <span className="flex h-8 w-8 items-center justify-center rounded-full bg-[#E6F4FD] text-[#1E9BE6]">
          <Quote className="h-4 w-4" aria-hidden />
        </span>
        <div>
          <h3 className="m-0 text-[15px] font-bold text-[#1B2B3A]">جملة المقال</h3>
          <p className="m-0 text-[12px] text-[#55667A]">عبارة عميقة من مقالك تظهر بطاقةً يشاركها القرّاء صورةً</p>
        </div>
      </div>

      <textarea
        value={quote}
        onChange={(e) => {
          setQuote(e.target.value);
          setDirty(true);
        }}
        rows={3}
        maxLength={PULL_QUOTE_MAX_CHARS + 20}
        placeholder="انسخ هنا أقوى عبارة في مقالك…"
        className="mt-3 w-full resize-y rounded-[14px] border border-[#E3EAF2] bg-[#FAFCFE] px-3.5 py-3 text-[16px] leading-8 text-[#1B2B3A] outline-none focus:border-[#1E9BE6] focus:ring-2 focus:ring-[#1E9BE6]/20"
        data-testid="input-pull-quote"
      />
      <div className="mt-1 flex flex-wrap items-center justify-between gap-2 text-[12px]">
        <span className={cn(validation.ok ? "text-[#55667A]" : "text-[#BF3038]")}>
          {validation.ok ? (inArticle ? "" : "العبارة غير موجودة بنصها في المقال، تأكد أنها من كلامك هنا") : validation.message}
        </span>
        <span dir="ltr" className={cn("tabular-nums", length > PULL_QUOTE_MAX_CHARS ? "text-[#BF3038]" : "text-[#8A9AAB]")}>
          {length}/{PULL_QUOTE_MAX_CHARS}
        </span>
      </div>

      {quote.trim() && validation.ok ? (
        <div className="mt-3 rounded-[18px] bg-gradient-to-br from-[#E2F2FD] to-[#EEF1FE] px-4 pb-4 pt-2" aria-label="معاينة البطاقة">
          <QuoteMark className="mb-1 mt-2 h-5 w-8" />
          <p className="m-0 text-[16px] font-bold leading-8 text-[#1B2B3A]">{normalizePullQuote(quote)}</p>
          <p className="m-0 mt-2 text-[12px] text-[#55667A]">
            <span className="font-semibold text-[#1B2B3A]">{data?.author?.name ?? authorName ?? "اسمك"}</span> · {OPINION_WRITER_CARD_SUBTITLE}
          </p>
        </div>
      ) : null}

      <div className="mt-4 flex items-start gap-3 rounded-[16px] bg-[#F7FAFD] p-3.5">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white text-[#1E9BE6]">
          <Vote className="h-4 w-4" aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <label htmlFor="opinion-agree-switch" className="block cursor-pointer text-[14px] font-bold text-[#1B2B3A]">
            أوافق / لا أوافق
          </label>
          <p className="m-0 text-[12px] leading-5 text-[#55667A]">يظهر في نهاية المقال سؤال «هل توافق الكاتب؟» وتُعرض النسبة للقارئ فور تصويته.</p>
        </div>
        <button
          type="button"
          role="switch"
          id="opinion-agree-switch"
          aria-checked={agreeOn}
          onClick={() => {
            setAgreeOn((v) => !v);
            setDirty(true);
          }}
          className={cn(
            "flex h-7 min-h-0 w-12 shrink-0 items-center rounded-full p-0.5 transition-colors",
            agreeOn ? "justify-end bg-[#1E9BE6]" : "justify-start bg-[#D8E3EE]",
          )}
          data-testid="switch-agree-vote"
        >
          <span className="block h-6 w-6 rounded-full bg-white shadow-[0_1px_3px_rgba(27,43,58,0.25)]" aria-hidden />
        </button>
      </div>

      <div className="mt-4 flex items-center justify-between gap-2">
        <span className="text-[12px] text-[#55667A]">
          {!articleId
            ? dirty
              ? "تُحفظ تلقائيًا مع أول حفظ للمسودة"
              : "متاحة بعد أول حفظ للمسودة"
            : !dirty && data
              ? <span className="inline-flex items-center gap-1 text-[#1A7F4B]"><Check className="h-3.5 w-3.5" aria-hidden /> محفوظة</span>
              : ""}
        </span>
        <button
          type="button"
          onClick={() => save.mutate()}
          disabled={!canSave}
          className="h-10 rounded-full bg-[#1E9BE6] px-5 text-[13px] font-semibold text-white disabled:bg-[#B9DDF5]"
          data-testid="button-save-opinion-extras"
        >
          {save.isPending ? "جارٍ الحفظ…" : "حفظ"}
        </button>
      </div>
    </section>
  );
}
