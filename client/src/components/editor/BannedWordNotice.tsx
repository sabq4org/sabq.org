import { useEffect } from "react";
import { Ban, X } from "lucide-react";
import { locateBannedWord, type BannedWordMatch } from "@shared/publishBannedWords";

export type BannedWordBlock = { message: string; bannedWords: BannedWordMatch[] };

const HIGHLIGHT_NAME = "sabq-banned-word";

type HighlightRegistry = { set: (name: string, value: unknown) => void; delete: (name: string) => void };

function highlightRegistry(): HighlightRegistry | null {
  const registry = (globalThis as { CSS?: { highlights?: HighlightRegistry } }).CSS?.highlights;
  return registry && typeof (globalThis as { Highlight?: unknown }).Highlight === "function" ? registry : null;
}

/** نطاقات كل ورود للكلمات داخل نص المحرر (عقدة نصية واحدة لكل ورود). */
function bannedRanges(words: string[]): Range[] {
  const ranges: Range[] = [];
  document.querySelectorAll(".ProseMirror").forEach((root) => {
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      const text = node.textContent ?? "";
      for (const word of words) {
        for (const [from, to] of locateBannedWord(text, word)) {
          const range = document.createRange();
          range.setStart(node, from);
          range.setEnd(node, to);
          ranges.push(range);
        }
      }
    }
  });
  return ranges;
}

/**
 * إشعار «لا يمكن نشر هذا الخبر»: يبقى ظاهرًا حتى ينجح الحفظ أو يغلقه المحرر،
 * ويظلّل العبارة داخل النص (CSS Custom Highlight، بلا تعديل على المحرر).
 */
export function BannedWordNotice({
  block,
  content,
  onDismiss,
}: {
  block: BannedWordBlock | null;
  content: string;
  onDismiss: () => void;
}) {
  const words = block?.bannedWords.map((match) => match.word) ?? [];
  const wordsKey = words.join("\n");

  useEffect(() => {
    const registry = highlightRegistry();
    if (!registry) return;
    if (!wordsKey) {
      registry.delete(HIGHLIGHT_NAME);
      return;
    }
    // بعد أن يرسم المحرر النص الجديد.
    const timer = window.setTimeout(() => {
      const ranges = bannedRanges(wordsKey.split("\n"));
      const HighlightCtor = (globalThis as unknown as { Highlight: new (...ranges: Range[]) => unknown }).Highlight;
      registry.set(HIGHLIGHT_NAME, new HighlightCtor(...ranges));
    }, 150);
    return () => {
      window.clearTimeout(timer);
      registry.delete(HIGHLIGHT_NAME);
    };
  }, [wordsKey, content]);

  if (!block) return null;

  const jumpToFirst = () => {
    const [first] = bannedRanges(words);
    const target = first?.startContainer.parentElement ?? document.querySelector(".ProseMirror");
    target?.scrollIntoView({ behavior: "smooth", block: "center" });
    if (first) {
      const selection = window.getSelection();
      selection?.removeAllRanges();
      selection?.addRange(first.cloneRange());
    }
  };

  return (
    <div
      role="alert"
      dir="rtl"
      className="sticky top-2 z-30 mx-auto mb-4 flex max-w-5xl flex-wrap items-start gap-4 rounded-[22px] border-[1.5px] border-[#F3C4C7] bg-white p-4 shadow-[0_2px_10px_rgba(27,43,58,0.06)] sm:p-5"
      data-testid="banned-word-notice"
    >
      <style>{`::highlight(${HIGHLIGHT_NAME}){background-color:#FDECEC;color:#BF3038;text-decoration:underline;text-decoration-color:#BF3038;}`}</style>
      <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[14px] bg-[#FDECEC]">
        <Ban className="h-5 w-5 text-[#BF3038]" aria-hidden="true" />
      </div>
      <div className="min-w-[220px] flex-1 space-y-1.5">
        <p className="text-[17px] font-bold text-[#BF3038]">لا يمكن نشر هذا الخبر</p>
        <p className="text-[14.5px] leading-7 text-[#1B2B3A]">
          {block.message.replace(/^لا يمكن نشر هذا الخبر:\s*/, "")}
        </p>
        <p className="text-[13.5px] text-[#55667A]">مسودتك محفوظة على جهازك كما هي، ويمكنك حفظها كمسودة.</p>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <button
          type="button"
          onClick={jumpToFirst}
          className="h-11 rounded-full bg-[#1E9BE6] px-5 text-sm font-semibold text-white shadow-[0_6px_14px_rgba(30,155,230,0.3)]"
          data-testid="button-banned-word-jump"
        >
          انتقل إلى موضعها
        </button>
        <button
          type="button"
          onClick={onDismiss}
          aria-label="إغلاق التنبيه"
          className="flex h-11 w-11 items-center justify-center rounded-full text-[#617183] hover:bg-[#F4F7FB]"
        >
          <X className="h-4 w-4" aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}
