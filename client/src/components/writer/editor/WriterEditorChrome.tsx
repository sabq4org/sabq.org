// محرر كاتب الرأي (المرحلة 4 من خطة لوحة الكاتب): رأس صفحة مثل بقية صفحات الكاتب، وشريط
// «قبل الإرسال» الجانبي، وشريط الجاهزية السفلي في الجوال، وبطاقة ملاحظة المحرر.
// المكونات عرضية فقط: كل الأفعال (حفظ، إرسال، اختيار اليوم) تأتي من المحرر.
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { Link } from "wouter";
import type { Editor } from "@tiptap/react";
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";
import {
  ArrowRight,
  BookOpen,
  Check,
  CheckCircle2,
  ChevronDown,
  Eye,
  Loader2,
  MessageSquareText,
  PenLine,
  Send,
} from "lucide-react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { WriterEditorialNoticesList } from "@/components/WriterEditorialNotices";
import { cn } from "@/lib/utils";
import {
  normalizeForMatch,
  WRITER_TITLE_APP_LIMIT,
  summarizeWriterReadiness,
  type WriterReadinessItem,
} from "@/lib/writerSubmitReadiness";

export const WRITER_HOME_PATH = "/dashboard/opinion-author";

type SaveState = "idle" | "saving" | "saved" | "error";

// ── رأس الصفحة (الخيار «أ» المعتمد 2026-11-24): مثل بقية صفحات الكاتب ──

export function WriterEditorTopBar({
  heading,
  statusLabel,
  statusTone = "neutral",
  saveState,
  lastSavedAt,
  onPreview,
  onSaveDraft,
  onSubmit,
  isSaving,
  submitDisabled,
  isResubmit,
  saveLabel,
}: {
  heading: string;
  statusLabel: string;
  /** warn: مسودة لم تُرسل للتحرير بعد. */
  statusTone?: "neutral" | "warn";
  saveState: SaveState;
  lastSavedAt: Date | null;
  onPreview?: () => void;
  onSaveDraft: () => void;
  onSubmit: () => void;
  isSaving: boolean;
  submitDisabled: boolean;
  isResubmit: boolean;
  saveLabel: string;
}) {
  return (
    <header className="mx-auto mb-7 max-w-[1120px] space-y-3 pt-6 sm:pt-8" data-testid="writer-editor-topbar">
      <Link
        href={WRITER_HOME_PATH}
        className="inline-flex items-center gap-1.5 text-sm text-[#0B6FA8] hover:underline dark:text-primary"
        data-testid="button-back"
      >
        <ArrowRight className="h-4 w-4" />
        لوحة الكاتب
      </Link>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between sm:gap-6">
        <div className="flex min-w-0 items-center gap-3 sm:gap-4">
          <span
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[14px] bg-[#EAF5FD] text-[#1E9BE6] dark:bg-primary/10 dark:text-primary sm:h-[52px] sm:w-[52px] sm:rounded-2xl"
            aria-hidden
          >
            <PenLine className="h-5 w-5 sm:h-[22px] sm:w-[22px]" strokeWidth={1.8} />
          </span>
          <div className="min-w-0 space-y-0.5">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-2xl font-bold leading-snug text-[#1B2B3A] dark:text-foreground sm:text-[28px]">{heading}</h1>
              <span
                className={cn(
                  "shrink-0 rounded-full px-3 py-0.5 text-xs",
                  statusTone === "warn"
                    ? "bg-[#FFF8EC] text-[#7A4B00] shadow-[inset_0_0_0_1px_#F5DDB0]"
                    : "bg-[#EEF2F6] text-[#55667A] dark:bg-muted dark:text-muted-foreground",
                )}
                data-testid="writer-editor-status"
              >
                {statusLabel}
              </span>
              <SaveIndicator state={saveState} lastSavedAt={lastSavedAt} />
            </div>
            <p className="text-[13px] leading-6 text-[#55667A] dark:text-muted-foreground sm:text-sm">
              اكتب العنوان والنص، وراجع «قبل الإرسال»، ثم اضغط «إرسال للمراجعة». الحفظ وحده لا يرسل المقال.
            </p>
          </div>
        </div>
        <div className="hidden shrink-0 items-center gap-2 sm:flex">
          {onPreview ? (
            <button
              type="button"
              onClick={onPreview}
              className="inline-flex h-11 items-center gap-1.5 rounded-full px-4 text-[15px] text-[#0B6FA8] hover:bg-[#EAF5FD] dark:text-primary dark:hover:bg-muted"
              data-testid="button-preview"
            >
              <Eye className="h-4 w-4" />
              معاينة
            </button>
          ) : null}
          <button
            type="button"
            onClick={onSaveDraft}
            disabled={isSaving}
            className="inline-flex h-11 items-center rounded-full bg-white px-5 text-[15px] font-semibold text-[#1B2B3A] shadow-[inset_0_0_0_1px_#DCE4EC] hover:bg-[#F7FAFC] disabled:opacity-60 dark:bg-card dark:text-foreground dark:shadow-none dark:hover:bg-muted"
            data-testid="button-save-draft"
          >
            {saveLabel}
          </button>
          <button
            type="button"
            onClick={onSubmit}
            disabled={submitDisabled}
            className="hidden h-11 items-center gap-2 rounded-full bg-[#1E9BE6] px-5 text-[15px] font-semibold text-white hover:bg-[#178BD0] disabled:opacity-60 lg:inline-flex"
            data-testid="button-publish"
          >
            {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            {isResubmit ? "إعادة الإرسال" : "إرسال للمراجعة"}
          </button>
        </div>
      </div>
    </header>
  );
}

function SaveIndicator({ state, lastSavedAt }: { state: SaveState; lastSavedAt: Date | null }) {
  if (state === "saving") {
    return (
      <span className="hidden shrink-0 items-center gap-1 text-xs text-[#55667A] sm:inline-flex" data-testid="autosave-indicator">
        <Loader2 className="h-3 w-3 animate-spin" />
        جارٍ الحفظ
      </span>
    );
  }
  if (state === "saved") {
    return (
      <span className="hidden shrink-0 items-center gap-1 text-xs text-[#1F8A5B] sm:inline-flex" data-testid="autosave-indicator">
        <CheckCircle2 className="h-3 w-3" />
        محفوظ
        {lastSavedAt ? (
          <span className="tabular-nums text-[#55667A]">
            {lastSavedAt.toLocaleTimeString("ar-SA-u-nu-latn", { hour: "numeric", minute: "2-digit" })}
          </span>
        ) : null}
      </span>
    );
  }
  return null;
}

// ── سطح الكتابة: العنوان والصورة والنص ──

export function WriterEditorCanvas({
  title,
  onTitleChange,
  titleDisabled,
  image,
  topNotice,
  children,
}: {
  title: string;
  onTitleChange: (value: string) => void;
  titleDisabled?: boolean;
  image: ReactNode;
  /** ملاحظة المحرر في الجوال (الشريط الجانبي مخفي هناك). */
  topNotice?: ReactNode;
  children: ReactNode;
}) {
  const titleRef = useRef<HTMLTextAreaElement | null>(null);
  // العنوان يصل من الخادم بعد التحميل، لذا نعيد حساب الارتفاع مع كل تغيّر في القيمة.
  useLayoutEffect(() => autoGrow(titleRef.current), [title]);
  const titleLength = title.trim().length;
  const titleTooLong = titleLength > WRITER_TITLE_APP_LIMIT;
  return (
    <div className="w-full space-y-4" data-testid="writer-editor-canvas">
      {topNotice ? <div className="lg:hidden">{topNotice}</div> : null}
      <section
        className="rounded-[22px] bg-white p-4 shadow-[0_2px_14px_rgba(27,43,58,0.06)] dark:bg-card sm:px-6 sm:py-5"
        id="editor-section-title"
      >
        <div className="mb-2.5 flex items-center justify-between gap-3">
          <label htmlFor="writer-title-input" className="text-[15px] font-bold text-[#1B2B3A] dark:text-foreground">
            عنوان المقال <span className="text-[#E5484D]">*</span>
          </label>
          <span
            className={cn("text-[13px] tabular-nums", titleTooLong ? "text-[#B54708]" : "text-[#8A99A8]")}
            data-testid="writer-title-counter"
          >
            {titleLength} / {WRITER_TITLE_APP_LIMIT} حرفًا
          </span>
        </div>
        <textarea
          id="writer-title-input"
          value={title}
          onChange={(event) => onTitleChange(event.target.value.replace(/\n+/g, " "))}
          placeholder="اكتب عنوانًا واضحًا لمقالك"
          rows={1}
          disabled={titleDisabled}
          className="block w-full resize-none overflow-hidden rounded-[14px] border-0 !bg-white px-4 py-3 text-[20px] font-bold leading-[1.5] text-[#1B2B3A] shadow-[inset_0_0_0_1px_#C9D4DF] placeholder:text-[#A3B1BF] focus:shadow-[inset_0_0_0_2px_#1E9BE6] focus:outline-none focus:ring-0 dark:!bg-background dark:text-foreground sm:px-[18px] sm:text-2xl"
          ref={titleRef}
          data-testid="input-title"
        />
        <p className={cn("mt-2 text-[13px]", titleTooLong ? "text-[#B54708]" : "text-[#55667A] dark:text-muted-foreground")}>
          {titleTooLong
            ? `أطول من ${WRITER_TITLE_APP_LIMIT} حرفًا، وقد يُقص في التطبيق.`
            : `يظهر كاملًا في التطبيق حتى ${WRITER_TITLE_APP_LIMIT} حرفًا.`}
        </p>
      </section>
      <div id="editor-section-media">{image}</div>
      <section
        className="rounded-[22px] bg-white px-4 pb-6 pt-4 shadow-[0_2px_14px_rgba(27,43,58,0.06)] dark:bg-card sm:px-6 sm:pt-5"
        id="editor-section-content"
      >
        <h2 className="mb-1 text-[15px] font-bold text-[#1B2B3A] dark:text-foreground">نص المقال</h2>
        {children}
      </section>
    </div>
  );
}

function autoGrow(element: HTMLTextAreaElement | null) {
  if (!element) return;
  element.style.height = "auto";
  element.style.height = `${element.scrollHeight}px`;
}

// ── ملاحظة المحرر ──

export function WriterEditorNoteCard({
  notes,
  passage,
  onShowPassage,
}: {
  notes: string;
  passage: string | null;
  onShowPassage?: () => void;
}) {
  return (
    <div className="rounded-[18px] bg-[#FFF8EC] p-4 shadow-[inset_0_0_0_1px_#F5DDB0] dark:bg-amber-950/30 dark:shadow-none" data-testid="writer-editor-note">
      <p className="flex items-center gap-2 text-[13px] font-semibold text-[#9A5B00] dark:text-amber-300">
        <MessageSquareText className="h-4 w-4" />
        ملاحظة المحرر
      </p>
      <p className="mt-2 whitespace-pre-wrap text-sm leading-7 text-[#1B2B3A] dark:text-foreground">{notes}</p>
      {passage && onShowPassage ? (
        <button
          type="button"
          onClick={onShowPassage}
          className="mt-3 inline-flex h-9 items-center rounded-full bg-white px-4 text-sm font-medium text-[#0B6FA8] shadow-[inset_0_0_0_1px_#F0D9AE] hover:bg-[#FFFDF8] dark:bg-card dark:text-primary dark:shadow-none"
          data-testid="button-show-note-passage"
        >
          أرني الفقرة المقصودة
        </button>
      ) : null}
      <p className="mt-3 text-xs leading-5 text-[#7A6A4F] dark:text-amber-200/80">
        عدّل ثم اضغط «إعادة الإرسال». تختفي الملاحظة بعد الإرسال.
      </p>
    </div>
  );
}

const noteHighlightKey = new PluginKey<string | null>("writerNoteHighlight");

/** موضع أول فقرة يحتوي نصها المقطع المقتبس (بعد تطبيع التشكيل والمسافات). */
function findPassageBlock(doc: ProseMirrorNode, target: string): { from: number; to: number } | null {
  let found: { from: number; to: number } | null = null;
  doc.descendants((node, pos) => {
    if (found) return false;
    if (!node.isTextblock) return true;
    if (normalizeForMatch(node.textContent).includes(target)) found = { from: pos, to: pos + node.nodeSize };
    return false;
  });
  return found;
}

/**
 * يظلّل الفقرة التي تحتوي المقطع المقتبس في ملاحظة المحرر، ويمرّر إليها عند الطلب.
 * التظليل زخرفة ProseMirror (Decoration) لا تدخل في نص المقال ولا تُحفظ،
 * وتبقى بعد إعادة رسم المحرر وتتبع الفقرة إن تغيّر موضعها.
 */
export function highlightPassageInEditor(editor: Editor | null, passage: string | null, { scroll = true } = {}): boolean {
  if (!editor || !passage || editor.isDestroyed) return false;
  const target = normalizeForMatch(passage);
  if (!noteHighlightKey.get(editor.state)) {
    editor.registerPlugin(
      new Plugin<string | null>({
        key: noteHighlightKey,
        state: {
          init: () => null,
          apply: (tr, value) => {
            const next = tr.getMeta(noteHighlightKey);
            return next === undefined ? value : (next as string | null);
          },
        },
        props: {
          decorations(state) {
            const wanted = noteHighlightKey.getState(state);
            if (!wanted) return DecorationSet.empty;
            const block = findPassageBlock(state.doc, wanted);
            if (!block) return DecorationSet.empty;
            return DecorationSet.create(state.doc, [Decoration.node(block.from, block.to, { class: "writer-note-target" })]);
          },
        },
      }),
    );
  }
  if (noteHighlightKey.getState(editor.state) !== target) {
    editor.view.dispatch(editor.state.tr.setMeta(noteHighlightKey, target).setMeta("addToHistory", false));
  }
  const block = findPassageBlock(editor.state.doc, target);
  if (!block) return false;
  if (scroll) {
    const dom = editor.view.nodeDOM(block.from);
    if (dom instanceof HTMLElement) dom.scrollIntoView({ behavior: "smooth", block: "center" });
  }
  return true;
}

// ── «قبل الإرسال» ──

function ReadinessList({ items, onPickDay }: { items: WriterReadinessItem[]; onPickDay: () => void }) {
  return (
    <ul className="divide-y divide-[#EEF2F6] dark:divide-border">
      {items.map((item) => (
        <li key={item.id} className="flex items-start gap-3 py-3" data-testid={`writer-readiness-${item.id}`}>
          <span
            className={cn(
              "mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full",
              item.ok
                ? "bg-[#1E9BE6] text-white"
                : item.blocking
                  ? "shadow-[inset_0_0_0_1.5px_#E0A23B]"
                  : "shadow-[inset_0_0_0_1.5px_#C9D4DF]",
            )}
            aria-hidden
          >
            {item.ok ? <Check className="h-3 w-3" /> : null}
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium text-[#1B2B3A] dark:text-foreground">{item.label}</p>
            <p className={cn("text-xs leading-5", item.blocking && !item.ok ? "text-[#9A5B00]" : "text-[#55667A] dark:text-muted-foreground")}>
              {item.detail}
            </p>
          </div>
          {item.action === "pick-day" && !item.ok ? (
            <button
              type="button"
              onClick={onPickDay}
              className="shrink-0 text-sm font-medium text-[#0B6FA8] hover:underline dark:text-primary"
              data-testid="button-pick-day-now"
            >
              حدّد يومك
            </button>
          ) : null}
        </li>
      ))}
    </ul>
  );
}

function ReadinessProgress({ done, total }: { done: number; total: number }) {
  return (
    <div className="h-1.5 overflow-hidden rounded-full bg-[#EEF2F6] dark:bg-muted" aria-hidden>
      <div className="h-full rounded-full bg-[#1E9BE6] transition-[width]" style={{ width: `${total ? (done / total) * 100 : 0}%` }} />
    </div>
  );
}

export function WriterSubmitRail({
  items,
  onPickDay,
  note,
  busyNotice,
}: {
  items: WriterReadinessItem[];
  onPickDay: () => void;
  note?: ReactNode;
  busyNotice?: ReactNode;
}) {
  const { done, total } = summarizeWriterReadiness(items);
  const [noticesOpen, setNoticesOpen] = useState(false);
  return (
    <aside className="hidden lg:block" aria-label="قبل الإرسال" data-testid="writer-submit-rail">
      <div className="sticky top-20 space-y-4">
        {note}
        {busyNotice}
        <section className="rounded-[22px] bg-white p-5 shadow-[0_2px_14px_rgba(27,43,58,0.06)] dark:bg-card">
          <div className="flex items-baseline justify-between gap-2">
            <h2 className="text-[15px] font-bold text-[#1B2B3A] dark:text-foreground">قبل الإرسال</h2>
            <span className="text-xs tabular-nums text-[#55667A] dark:text-muted-foreground" data-testid="writer-readiness-count">
              {done} من {total}
            </span>
          </div>
          <div className="mt-3">
            <ReadinessProgress done={done} total={total} />
          </div>
          <div className="mt-1">
            <ReadinessList items={items} onPickDay={onPickDay} />
          </div>
        </section>
        <section className="rounded-[22px] bg-white p-5 shadow-[0_2px_14px_rgba(27,43,58,0.06)] dark:bg-card">
          <h2 className="text-[15px] font-bold text-[#1B2B3A] dark:text-foreground">بعد الإرسال</h2>
          <p className="mt-2 text-sm leading-6 text-[#55667A] dark:text-muted-foreground">
            يراجع المحرر مقالك ويصلك قراره في الإشعارات. إن طلب تعديلًا تظهر ملاحظته هنا بجانب النص.
          </p>
          <Collapsible open={noticesOpen} onOpenChange={setNoticesOpen}>
            <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
              <CollapsibleTrigger asChild>
                <button type="button" className="inline-flex items-center gap-1 text-[#0B6FA8] hover:underline dark:text-primary" data-testid="button-writer-notices">
                  تنويهات التحرير
                  <ChevronDown className={cn("h-3.5 w-3.5 transition-transform", noticesOpen && "rotate-180")} />
                </button>
              </CollapsibleTrigger>
              <Link href="/dashboard/opinion-author/guide#writing" className="inline-flex items-center gap-1 text-[#0B6FA8] hover:underline dark:text-primary">
                <BookOpen className="h-3.5 w-3.5" />
                دليل الكاتب
              </Link>
            </div>
            <CollapsibleContent>
              <WriterEditorialNoticesList className="mt-3 border-t border-[#EEF2F6] pt-3 dark:border-border" />
            </CollapsibleContent>
          </Collapsible>
        </section>
      </div>
    </aside>
  );
}

// ── شريط الجاهزية في الجوال ──

export function WriterMobileReadinessBar({
  items,
  onPickDay,
  onSaveDraft,
  onSubmit,
  isSaving,
  submitDisabled,
  isResubmit,
}: {
  items: WriterReadinessItem[];
  onPickDay: () => void;
  onSaveDraft: () => void;
  onSubmit: () => void;
  isSaving: boolean;
  submitDisabled: boolean;
  isResubmit: boolean;
}) {
  const { done, total, firstMissing } = summarizeWriterReadiness(items);
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (done === total) setOpen(false);
  }, [done, total]);
  return (
    <div
      className="fixed inset-x-0 bottom-0 z-40 border-t border-[#E6ECF2] bg-white/95 px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-2.5 shadow-[0_-8px_24px_rgba(27,43,58,0.06)] backdrop-blur dark:border-border dark:bg-card/95 lg:hidden"
      data-testid="writer-mobile-readiness-bar"
    >
      {open ? (
        <div className="mx-auto mb-2 max-w-lg rounded-[18px] bg-[#F7FAFC] px-4 py-1 dark:bg-muted/40">
          <ReadinessList items={items} onPickDay={onPickDay} />
        </div>
      ) : null}
      <div className="mx-auto flex max-w-lg items-center gap-2">
        <button
          type="button"
          onClick={() => setOpen((value) => !value)}
          className="min-w-0 flex-1 text-start"
          aria-expanded={open}
          data-testid="button-writer-readiness-toggle"
        >
          <span className="block text-[13px] font-semibold text-[#1B2B3A] dark:text-foreground">
            قبل الإرسال: <span className="tabular-nums">{done} من {total}</span>
          </span>
          <span className={cn("block truncate text-xs", firstMissing?.blocking ? "text-[#9A5B00]" : "text-[#55667A] dark:text-muted-foreground")}>
            {firstMissing ? `ينقص: ${firstMissing.label}` : "جاهز للإرسال"}
          </span>
        </button>
        <button
          type="button"
          onClick={onSaveDraft}
          disabled={isSaving}
          className="h-10 shrink-0 rounded-full px-3.5 text-sm text-[#1B2B3A] shadow-[inset_0_0_0_1px_#DCE4EC] disabled:opacity-60 dark:text-foreground dark:shadow-none"
          data-testid="button-save-draft-mobile-bar"
        >
          حفظ فقط
        </button>
        <button
          type="button"
          onClick={onSubmit}
          disabled={submitDisabled}
          className="inline-flex h-10 shrink-0 items-center gap-1.5 rounded-full bg-[#1E9BE6] px-4 text-sm font-semibold text-white disabled:opacity-60"
          data-testid="button-publish-mobile-bar"
        >
          {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          {isResubmit ? "إعادة الإرسال" : "إرسال"}
        </button>
      </div>
    </div>
  );
}
