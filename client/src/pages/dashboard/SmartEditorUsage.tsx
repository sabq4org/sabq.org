// «استخدام المحرر الذكي»: لكل محرر كم خبرًا نشر، وكم منها شُغّل عليه «تحرير وتوليد شامل»،
// وكم بقي من الناتج في المنشور. للمسؤول ومدير النظام فقط. البيانات من /api/admin/smart-edit-usage.
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ChevronDown, ExternalLink } from "lucide-react";
import { DashboardLayout } from "@/components/DashboardLayout";
import { cn } from "@/lib/utils";
import { adoptionLabel, type SmartEditAdoption } from "@shared/smartEditRuns";

interface UsageArticle {
  articleId: string;
  title: string;
  slug: string;
  englishSlug: string | null;
  publishedAt: string | null;
  runs: number;
  aiPct: number | null;
  adoption: SmartEditAdoption | null;
}

interface UsageEditor {
  userId: string;
  firstName: string | null;
  lastName: string | null;
  avatarUrl: string | null;
  published: number;
  withRun: number;
  avgAiPct: number | null;
  articles: UsageArticle[];
}

interface UsageResponse {
  days: number;
  totals: { published: number; withRun: number; withoutRun: number; runs: number };
  editors: UsageEditor[];
}

const GROUP = "rounded-[22px] bg-white shadow-[0_2px_10px_rgba(27,43,58,0.06)]";
const RANGES = [
  { days: 1, label: "اليوم" },
  { days: 7, label: "7 أيام" },
  { days: 30, label: "30 يومًا" },
];

const PILL: Record<string, string> = {
  green: "bg-[#E8F6EF] text-[#13734E]",
  amber: "bg-[#FFF6E5] text-[#946000]",
  red: "bg-[#FDECEE] text-[#BF3038]",
  neutral: "bg-[#EEF2F6] text-[#55667A]",
};

function editorName(editor: Pick<UsageEditor, "firstName" | "lastName">): string {
  return [editor.firstName, editor.lastName].filter(Boolean).join(" ") || "مستخدم";
}

/** حالة المحرر في الفترة: لم يشغّله، نادرًا، يشغّله ثم يتجاهل الناتج، يستخدمه. */
function editorStatus(editor: UsageEditor): { label: string; tone: keyof typeof PILL } {
  if (editor.withRun === 0) return { label: "لم يشغّله", tone: "red" };
  const share = editor.withRun / editor.published;
  if (share < 0.5) return { label: "نادرًا", tone: "amber" };
  if (editor.avgAiPct !== null && editor.avgAiPct < 25) return { label: "يشغّله ثم يتجاهل الناتج", tone: "amber" };
  return { label: "يستخدمه", tone: "green" };
}

function shortDate(value: string | null): string {
  if (!value) return "";
  return new Intl.DateTimeFormat("ar-SA-u-ca-gregory-nu-latn", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" }).format(new Date(value));
}

export default function SmartEditorUsage() {
  const [days, setDays] = useState(7);
  const [open, setOpen] = useState<string | null>(null);
  const { data, isLoading, isError, error } = useQuery<UsageResponse>({
    queryKey: [`/api/admin/smart-edit-usage?days=${days}`],
  });
  const editors = Array.isArray(data?.editors) ? data!.editors : [];
  const totals = data?.totals;

  return (
    <DashboardLayout>
      <div dir="rtl" className="min-h-full rounded-[22px] bg-[#F4F7FB] px-4 py-6 text-[#1B2B3A] sm:px-8 sm:py-9">
        <div className="mx-auto flex max-w-[1120px] flex-col gap-5">
          <header className="flex flex-wrap items-end justify-between gap-3">
            <div className="space-y-1">
              <p className="text-[13px] text-[#55667A]">التحرير · الأخبار المنشورة من لوحة التحكم والتطبيق</p>
              <h1 className="text-[26px] font-bold sm:text-[28px]">من يستخدم المحرر الذكي فعلًا؟</h1>
              <p className="text-sm text-[#55667A]">
                كل تشغيل لـ«تحرير وتوليد شامل» يُسجَّل تلقائيًا باسم من شغّله، ونسبة ما بقي من ناتجه في الخبر.
              </p>
            </div>
            <div className="inline-flex gap-1 rounded-full bg-white p-1 shadow-[0_2px_10px_rgba(27,43,58,0.06)]" role="group" aria-label="الفترة">
              {RANGES.map((range) => (
                <button
                  key={range.days}
                  type="button"
                  aria-pressed={days === range.days}
                  onClick={() => setDays(range.days)}
                  className={cn(
                    "h-10 rounded-full px-4 text-sm font-medium",
                    days === range.days ? "bg-[#1E9BE6] text-white shadow-[0_4px_14px_rgba(30,155,230,0.3)]" : "text-[#55667A]",
                  )}
                  data-testid={`button-range-${range.days}`}
                >
                  {range.label}
                </button>
              ))}
            </div>
          </header>

          {isLoading && <div className={`${GROUP} h-40 animate-pulse`} />}
          {isError && (
            <div className={`${GROUP} p-5 text-sm text-[#BF3038]`}>
              {(error as Error)?.message?.includes("503") || (error as Error)?.message?.includes("لم يُفعَّل")
                ? "السجل لم يُفعَّل بعد: يحتاج تنفيذ ملف SQL الخاص به."
                : "تعذر تحميل الملخص. أعد المحاولة بعد قليل."}
            </div>
          )}

          {totals && (
            <section className="flex flex-wrap items-center gap-6 rounded-[22px] border border-white bg-gradient-to-l from-[#E2F2FD] to-[#EEF1FE] p-5">
              <div>
                <div className="text-[13px] text-[#55667A]">أخبار نُشرت دون أي تشغيل</div>
                <div className="text-[34px] font-bold leading-tight tabular-nums" data-testid="text-without-run">{totals.withoutRun}</div>
                <div className="text-[13px] text-[#55667A]">
                  من <span className="tabular-nums">{totals.published}</span> خبرًا · <span className="tabular-nums">{totals.runs}</span> تشغيلًا في الفترة
                </div>
              </div>
              <p className="m-0 max-w-[48ch] text-sm text-[#55667A]">
                «دون تشغيل» يعني أن الخادم لم يسجّل أي «تحرير وتوليد شامل» مربوط بالخبر من أي حساب. يبدأ العدّ من يوم تفعيل السجل.
              </p>
            </section>
          )}

          {totals && editors.length === 0 && (
            <div className={`${GROUP} p-6 text-center text-sm text-[#55667A]`}>لا أخبار منشورة باسم محرر في هذه الفترة.</div>
          )}

          {editors.length > 0 && (
            <section className={`${GROUP} overflow-hidden`}>
              <div className="hidden grid-cols-[minmax(0,1.6fr)_80px_80px_minmax(0,1.4fr)_170px] gap-3 px-5 py-3 text-xs text-[#617183] sm:grid">
                <div>المحرر</div>
                <div>نشر</div>
                <div>شغّله</div>
                <div>كم بقي من الناتج في المنشور (متوسط)</div>
                <div />
              </div>
              {editors.map((editor) => {
                const status = editorStatus(editor);
                const expanded = open === editor.userId;
                return (
                  <div key={editor.userId} className="border-t border-[#EEF2F6]">
                    <button
                      type="button"
                      className="grid w-full grid-cols-[minmax(0,1fr)_auto] items-center gap-3 px-5 py-3.5 text-right sm:grid-cols-[minmax(0,1.6fr)_80px_80px_minmax(0,1.4fr)_170px]"
                      aria-expanded={expanded}
                      onClick={() => setOpen(expanded ? null : editor.userId)}
                      data-testid={`row-editor-${editor.userId}`}
                    >
                      <span className="flex min-w-0 items-center gap-2.5">
                        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-[#E6F4FD] font-bold text-[#0B6FA8] ring-2 ring-white">
                          {editorName(editor).charAt(0)}
                        </span>
                        <span className="min-w-0">
                          <b className="block truncate text-[15px]">{editorName(editor)}</b>
                          <span className="text-xs text-[#617183] sm:hidden">
                            نشر <span className="tabular-nums">{editor.published}</span> · شغّله <span className="tabular-nums">{editor.withRun}</span>
                            {editor.avgAiPct !== null && <> · <span className="tabular-nums">{editor.avgAiPct}%</span></>}
                          </span>
                        </span>
                      </span>
                      <span className="hidden tabular-nums sm:block">{editor.published}</span>
                      <span className="hidden tabular-nums sm:block">{editor.withRun}</span>
                      <span className="hidden sm:block">
                        {editor.avgAiPct !== null ? (
                          <span className="flex items-center gap-2">
                            <span className="h-2 flex-1 overflow-hidden rounded-full bg-[#EEF2F6]">
                              <span className="block h-full rounded-full bg-[#1E9BE6]" style={{ width: `${editor.avgAiPct}%` }} />
                            </span>
                            <span className="w-10 text-xs tabular-nums text-[#55667A]">{editor.avgAiPct}%</span>
                          </span>
                        ) : (
                          <span className="text-xs text-[#617183]">—</span>
                        )}
                      </span>
                      <span className="flex items-center justify-end gap-2">
                        <span className={cn("whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-semibold", PILL[status.tone])}>{status.label}</span>
                        <ChevronDown className={cn("h-4 w-4 text-[#617183] transition-transform", expanded && "rotate-180")} />
                      </span>
                    </button>
                    {expanded && (
                      <ul className="m-0 list-none divide-y divide-[#EEF2F6] bg-[#FAFCFE] px-5 py-1">
                        {editor.articles.map((article) => {
                          const tag = article.runs === 0
                            ? { label: "دون تشغيل", tone: "red" }
                            : adoptionLabel(article.adoption);
                          return (
                            <li key={article.articleId} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2.5 text-sm">
                              <a
                                href={`/dashboard/articles/${article.articleId}/edit`}
                                className="min-w-0 basis-full line-clamp-2 text-[#0B6FA8] hover:underline sm:basis-0 sm:flex-1 sm:truncate"
                                title="افتح الخبر ثم «السجل الزمني» لمقارنة النصوص"
                              >
                                {article.title}
                              </a>
                              <span className="text-xs text-[#617183]">{shortDate(article.publishedAt)}</span>
                              {article.runs > 0 && <span className="text-xs text-[#617183]"><span className="tabular-nums">{article.runs}</span> تشغيل</span>}
                              {article.aiPct !== null && <span className="text-xs tabular-nums text-[#55667A]">{article.aiPct}%</span>}
                              <span className={cn("rounded-full px-2.5 py-0.5 text-xs font-semibold", PILL[tag.tone])}>{tag.label}</span>
                              <a
                                href={`/article/${article.englishSlug || article.slug}`}
                                target="_blank"
                                rel="noreferrer"
                                className="text-[#617183] hover:text-[#0B6FA8]"
                                aria-label="الخبر المنشور"
                              >
                                <ExternalLink className="h-3.5 w-3.5" />
                              </a>
                            </li>
                          );
                        })}
                      </ul>
                    )}
                  </div>
                );
              })}
            </section>
          )}

          <p className="text-xs text-[#617183]">
            افتح أي خبر ثم «السجل الزمني» لترى كل تشغيل: من شغّله، والنص الملصق، وناتج المحرر الذكي، والنص المنشور مع تلوين الفروق.
          </p>
        </div>
      </div>
    </DashboardLayout>
  );
}
