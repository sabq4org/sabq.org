import { useEffect, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Loader2, Search, Trash2 } from "lucide-react";
import { DashboardLayout } from "@/components/DashboardLayout";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
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
import { ROLE_LABELS_AR } from "@shared/rbac-constants";
import { BANNED_WORD_MIN_LENGTH } from "@shared/publishBannedWords";

type WordRow = {
  id: string;
  word: string;
  note: string | null;
  isActive: boolean;
  blockedCount: number;
  createdAt: string;
};
type BlockRow = {
  id: string;
  word: string;
  articleId: string | null;
  articleTitle: string | null;
  actorLabel: string | null;
  action: string;
  surface: string;
  createdAt: string;
};
type ListResponse = { words: WordRow[]; recentBlocks: BlockRow[]; blockedThisMonth: number };
type Preview = { word: string; days: number; count: number; samples: Array<{ id: string; title: string }> };

const LIST_QUERY = ["/api/admin/publish-banned-words"];
const ACTION_LABELS: Record<string, string> = { publish: "محاولة نشر", schedule: "محاولة جدولة", edit: "تعديل منشور" };
const SURFACE_LABELS: Record<string, string> = { dashboard: "لوحة التحكم", desk: "مكتب سبق", bot: "نشر سبق" };

const dateFormat = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Riyadh", year: "numeric", month: "2-digit", day: "2-digit" });
const timeFormat = new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Riyadh", hour: "2-digit", minute: "2-digit", hour12: false });

function day(iso: string): string {
  return dateFormat.format(new Date(iso)).replace(/-/g, "/");
}

function attempts(count: number): string {
  if (count === 0) return "لا محاولات";
  if (count === 1) return "مُنعت محاولة واحدة";
  if (count === 2) return "مُنعت محاولتان";
  return count <= 10 ? `مُنعت ${count} محاولات` : `مُنعت ${count} محاولة`;
}

function newsCount(count: number): string {
  if (count === 0) return "لم ترد في أي خبر";
  if (count === 1) return "وردت في خبر واحد";
  if (count === 2) return "وردت في خبرين";
  return count <= 10 ? `وردت في ${count} أخبار` : `وردت في ${count} خبرًا`;
}

function actorRole(label: string | null): string {
  if (!label) return "غير معروف";
  return (ROLE_LABELS_AR as Record<string, string>)[label] ?? label;
}

const GROUP = "rounded-[22px] bg-white shadow-[0_2px_10px_rgba(27,43,58,0.06)]";

export default function PublishBannedWords() {
  const { toast } = useToast();
  const [word, setWord] = useState("");
  const [note, setNote] = useState("");
  const [debouncedWord, setDebouncedWord] = useState("");
  const [deleting, setDeleting] = useState<WordRow | null>(null);

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedWord(word.trim()), 450);
    return () => window.clearTimeout(timer);
  }, [word]);

  const { data: dataRaw, isLoading, isError, refetch } = useQuery<ListResponse>({ queryKey: LIST_QUERY });
  const words = Array.isArray(dataRaw?.words) ? dataRaw.words : [];
  const recentBlocks = Array.isArray(dataRaw?.recentBlocks) ? dataRaw.recentBlocks : [];
  const activeCount = words.filter((row) => row.isActive).length;

  const previewEnabled = debouncedWord.length >= BANNED_WORD_MIN_LENGTH;
  const { data: preview, isFetching: previewLoading } = useQuery<Preview>({
    queryKey: [`/api/admin/publish-banned-words/preview?word=${encodeURIComponent(debouncedWord)}`],
    enabled: previewEnabled,
    retry: false,
  });

  const fail = (error: Error) =>
    toast({ title: "تعذر التنفيذ", description: error.message, variant: "destructive" });
  const refresh = () => queryClient.invalidateQueries({ queryKey: LIST_QUERY });

  const addMutation = useMutation({
    mutationFn: () => apiRequest("/api/admin/publish-banned-words", { method: "POST", body: JSON.stringify({ word, note }) }),
    onSuccess: () => {
      toast({ title: "أضيفت للقائمة", description: `«${word.trim()}» تمنع النشر والجدولة من الآن.` });
      setWord("");
      setNote("");
      refresh();
    },
    onError: fail,
  });

  const toggleMutation = useMutation({
    mutationFn: (row: WordRow) =>
      apiRequest(`/api/admin/publish-banned-words/${row.id}`, { method: "PATCH", body: JSON.stringify({ isActive: !row.isActive }) }),
    onSuccess: refresh,
    onError: fail,
  });

  const deleteMutation = useMutation({
    mutationFn: (row: WordRow) => apiRequest(`/api/admin/publish-banned-words/${row.id}`, { method: "DELETE" }),
    onSuccess: () => {
      setDeleting(null);
      refresh();
    },
    onError: fail,
  });

  const canAdd = word.trim().length >= BANNED_WORD_MIN_LENGTH && !addMutation.isPending;

  return (
    <DashboardLayout>
      <div dir="rtl" className="min-h-full rounded-[22px] bg-[#F4F7FB] px-4 py-6 text-[#1B2B3A] sm:px-8 sm:py-9">
        <div className="mx-auto flex max-w-[1120px] flex-col gap-5">
          <header className="flex flex-wrap items-end justify-between gap-3">
            <div className="space-y-1">
              <p className="text-[13px] text-[#55667A]">التحرير · ضوابط النشر</p>
              <h1 className="text-[26px] font-bold sm:text-[28px]">كلمات محظورة من النشر</h1>
              <p className="text-sm text-[#55667A]">
                أي خبر يرد فيه أحد هذه الأسماء أو العبارات لا يستطيع المراسل أو الناشر نشره أو جدولته.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <span className="rounded-full bg-[#FDECEC] px-3.5 py-1.5 text-[13px] font-semibold text-[#BF3038]" data-testid="text-active-count">
                {activeCount} مفعّلة
              </span>
              <span className="rounded-full bg-[#FFF6E5] px-3.5 py-1.5 text-[13px] font-semibold text-[#946000]">
                {attempts(dataRaw?.blockedThisMonth ?? 0)} آخر 30 يومًا
              </span>
            </div>
          </header>

          <form
            className={`${GROUP} flex flex-col gap-3.5 p-4 sm:p-5`}
            onSubmit={(event) => {
              event.preventDefault();
              if (canAdd) addMutation.mutate();
            }}
          >
            <div className="flex flex-wrap items-center gap-2.5">
              <label htmlFor="banned-word" className="sr-only">كلمة أو اسم جهة</label>
              <input
                id="banned-word"
                value={word}
                onChange={(event) => setWord(event.target.value)}
                maxLength={80}
                placeholder="اكتب كلمة أو اسم جهة، مثل: نحو الرؤية"
                className="h-12 min-w-[220px] flex-[2] rounded-full border-[1.5px] border-[#DCE4EC] bg-white px-5 text-base font-medium outline-none focus:border-[#1E9BE6]"
                data-testid="input-banned-word"
              />
              <label htmlFor="banned-note" className="sr-only">السبب</label>
              <input
                id="banned-note"
                value={note}
                onChange={(event) => setNote(event.target.value)}
                maxLength={300}
                placeholder="السبب (اختياري، يراه المدير فقط)"
                className="h-12 min-w-[200px] flex-1 rounded-full border border-[#DCE4EC] bg-white px-5 text-sm outline-none focus:border-[#1E9BE6]"
              />
              <button
                type="submit"
                disabled={!canAdd}
                className="h-12 rounded-full bg-[#1E9BE6] px-7 text-[15px] font-semibold text-white shadow-[0_6px_14px_rgba(30,155,230,0.3)] disabled:bg-[#DCE4EC] disabled:text-[#55667A] disabled:shadow-none"
                data-testid="button-add-banned-word"
              >
                {addMutation.isPending ? "جارٍ الإضافة" : "إضافة للقائمة"}
              </button>
            </div>

            {previewEnabled && (
              <div className="flex flex-wrap items-start gap-3 rounded-2xl bg-[#E6F4FD] px-4 py-3" aria-live="polite" data-testid="banned-word-preview">
                {previewLoading || !preview ? (
                  <Loader2 className="mt-0.5 h-5 w-5 animate-spin text-[#0B6FA8]" aria-hidden="true" />
                ) : (
                  <Search className="mt-0.5 h-5 w-5 text-[#0B6FA8]" aria-hidden="true" />
                )}
                <div className="min-w-[200px] flex-1 space-y-1.5 text-sm">
                  {preview && !previewLoading ? (
                    <>
                      <p>
                        <strong className="font-semibold">فحص قبل الحفظ:</strong> «{preview.word}»{" "}
                        <strong className="font-bold text-[#0B6FA8]">{newsCount(preview.count)}</strong> نُشر خلال آخر{" "}
                        {preview.days} يومًا. المنشور لا يتأثر، والمنع يبدأ من الآن.
                      </p>
                      {preview.samples.length > 0 && (
                        <ul className="space-y-1 text-[13px] text-[#55667A]">
                          {preview.samples.map((sample) => (
                            <li key={sample.id} className="truncate">· {sample.title}</li>
                          ))}
                        </ul>
                      )}
                    </>
                  ) : (
                    <p>جارٍ فحص الأخبار المنشورة آخر 30 يومًا</p>
                  )}
                </div>
              </div>
            )}

            <p className="text-[12.5px] leading-6 text-[#617183]">
              يُفحص العنوان والعنوان الفرعي والمقتطف والنص والوسوم. لا فرق بين الهمزات والتشكيل والتطويل، والمطابقة
              للعبارة كاملة لا لجزء من كلمة. حساب المسؤول ومدير النظام مستثنى من المنع.
            </p>
          </form>

          <section className="space-y-2">
            <h2 className="px-1.5 text-[13px] font-normal text-[#55667A]">القائمة</h2>
            <div className={`${GROUP} px-4 py-1 sm:px-5`}>
              {isLoading ? (
                <div className="flex items-center justify-center gap-2 py-10 text-sm text-[#55667A]">
                  <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" /> جارٍ التحميل
                </div>
              ) : isError ? (
                <div className="flex flex-col items-center gap-3 py-10 text-sm text-[#55667A]">
                  <p>تعذر تحميل القائمة.</p>
                  <button type="button" onClick={() => refetch()} className="h-11 rounded-full bg-[#E6F4FD] px-5 font-semibold text-[#0B6FA8]">
                    إعادة المحاولة
                  </button>
                </div>
              ) : words.length === 0 ? (
                <p className="py-10 text-center text-sm text-[#55667A]" data-testid="banned-words-empty">
                  القائمة فارغة. أضف أول كلمة من الحقل أعلاه، وسيبدأ المنع فورًا.
                </p>
              ) : (
                words.map((row, index) => (
                  <div
                    key={row.id}
                    className={`flex flex-wrap items-center gap-3 py-3.5 ${index < words.length - 1 ? "border-b border-[#EEF2F6]" : ""}`}
                    data-testid={`banned-word-row-${row.id}`}
                  >
                    <div className="min-w-[160px] flex-1 space-y-0.5">
                      <p className={`text-base font-semibold ${row.isActive ? "" : "text-[#617183]"}`}>{row.word}</p>
                      <p className="text-[13px] text-[#55667A]">
                        {row.isActive ? "" : "موقوفة مؤقتًا، لا تمنع النشر · "}
                        {row.note ? `${row.note} · ` : ""}أضيفت <span dir="ltr">{day(row.createdAt)}</span>
                      </p>
                    </div>
                    <span
                      className={`rounded-full px-3 py-1 text-[12.5px] ${row.blockedCount > 0 ? "bg-[#FFF6E5] font-semibold text-[#946000]" : "text-[#617183]"}`}
                    >
                      {attempts(row.blockedCount)}
                    </span>
                    <button
                      type="button"
                      aria-pressed={row.isActive}
                      aria-label={row.isActive ? `إيقاف «${row.word}» مؤقتًا` : `تفعيل «${row.word}»`}
                      disabled={toggleMutation.isPending}
                      onClick={() => toggleMutation.mutate(row)}
                      className="flex h-11 w-[52px] items-center"
                      data-testid={`toggle-banned-word-${row.id}`}
                    >
                      <span className={`flex h-[30px] w-[50px] rounded-full p-[3px] transition-colors ${row.isActive ? "justify-end bg-[#1E9BE6]" : "justify-start bg-[#DCE4EC]"}`}>
                        <span className="block h-6 w-6 rounded-full bg-white" />
                      </span>
                    </button>
                    <button
                      type="button"
                      aria-label={`حذف «${row.word}»`}
                      onClick={() => setDeleting(row)}
                      className="flex h-11 w-11 items-center justify-center rounded-full text-[#617183] hover:bg-[#F4F7FB]"
                      data-testid={`delete-banned-word-${row.id}`}
                    >
                      <Trash2 className="h-[18px] w-[18px]" aria-hidden="true" />
                    </button>
                  </div>
                ))
              )}
            </div>
          </section>

          {recentBlocks.length > 0 && (
            <section className="space-y-2">
              <h2 className="px-1.5 text-[13px] font-normal text-[#55667A]">آخر المحاولات التي مُنعت</h2>
              <div className={`${GROUP} px-4 py-1 sm:px-5`}>
                {recentBlocks.map((row, index) => (
                  <div
                    key={row.id}
                    className={`flex flex-wrap items-center gap-x-4 gap-y-1 py-3 ${index < recentBlocks.length - 1 ? "border-b border-[#EEF2F6]" : ""}`}
                  >
                    <span dir="ltr" className="w-[118px] text-right text-[13px] text-[#55667A]">
                      {day(row.createdAt)} {timeFormat.format(new Date(row.createdAt))}
                    </span>
                    <span className="min-w-[200px] flex-1 text-[14.5px] font-medium">{row.articleTitle || "بلا عنوان"}</span>
                    <span className="text-[13px] text-[#55667A]">
                      {actorRole(row.actorLabel)} · {ACTION_LABELS[row.action] ?? row.action} · {SURFACE_LABELS[row.surface] ?? row.surface}
                    </span>
                    <span className="rounded-full bg-[#FDECEC] px-3 py-1 text-[12.5px] font-semibold text-[#BF3038]">{row.word}</span>
                  </div>
                ))}
              </div>
            </section>
          )}
        </div>
      </div>

      <AlertDialog open={Boolean(deleting)} onOpenChange={(open) => !open && setDeleting(null)}>
        <AlertDialogContent dir="rtl">
          <AlertDialogHeader>
            <AlertDialogTitle>حذف «{deleting?.word}» من القائمة؟</AlertDialogTitle>
            <AlertDialogDescription>
              بعد الحذف يعود نشر الأخبار التي ترد فيها مسموحًا للجميع. إن أردت إيقافها مؤقتًا فاستخدم مفتاح التفعيل.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>تراجع</AlertDialogCancel>
            <AlertDialogAction onClick={() => deleting && deleteMutation.mutate(deleting)}>حذف</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </DashboardLayout>
  );
}
