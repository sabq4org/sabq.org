// نافذة ما بعد «حفظ دون إرسال» لكاتب الرأي (2026-11-26).
// بعض الكتّاب كانوا يحفظون المسودة فيرون «تم الحفظ بنجاح» ويظنون أن المقال وصل للتحرير.
// النافذة تقول صراحة إن المقال لم يُرسل، وتضع زر الإرسال في المكان نفسه.
import { AlertCircle, Clock3, Send } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

export type WriterUnsentDraftState =
  | { kind: "unsent" }
  /** لدى الكاتب مقال آخر لدى التحرير؛ لا يمكنه الإرسال الآن. */
  | { kind: "busy"; activeTitle: string };

const STEPS = [
  { key: "saved", label: "✓ محفوظ" },
  { key: "unsent", label: "لم يُرسل" },
  { key: "desk", label: "لدى التحرير" },
  { key: "scheduled", label: "مجدول" },
] as const;

export function WriterUnsentDraftDialog({
  state,
  onSubmitNow,
  onLater,
}: {
  state: WriterUnsentDraftState | null;
  onSubmitNow: () => void;
  onLater: () => void;
}) {
  const busy = state?.kind === "busy";
  return (
    <Dialog open={state !== null} onOpenChange={(open) => (!open ? onLater() : undefined)}>
      <DialogContent
        dir="rtl"
        className="max-w-[440px] rounded-[22px] border-0 bg-white p-6 text-right shadow-[0_18px_48px_rgba(27,43,58,0.18)] dark:bg-card"
        data-testid="writer-unsent-draft-dialog"
      >
        <span
          className="mb-1 grid h-12 w-12 place-items-center rounded-2xl bg-[#FFF8EC] text-[#E89B1A]"
          aria-hidden
        >
          {busy ? <Clock3 className="h-6 w-6" /> : <AlertCircle className="h-6 w-6" />}
        </span>
        <DialogTitle className="text-right text-[19px] font-bold leading-snug text-[#1B2B3A] dark:text-foreground">
          {busy ? "حُفظ كمسودة، ولم يُرسل" : "حُفظ مقالك، لكنه لم يُرسل بعد"}
        </DialogTitle>
        <DialogDescription className="text-right text-sm leading-7 text-[#55667A] dark:text-muted-foreground">
          {state?.kind === "busy"
            ? `لديك «${state.activeTitle}» لدى هيئة التحرير. أرسل هذه المسودة بعد نشره، وسنذكّرك حينها.`
            : "المقال محفوظ عندك فقط، ولن تراه هيئة التحرير حتى تضغط «إرسال للمراجعة»."}
        </DialogDescription>
        {!busy ? (
          <ol className="m-0 flex list-none flex-wrap items-center gap-1.5 p-0" aria-label="مراحل المقال">
            {STEPS.map((step) => (
              <li
                key={step.key}
                aria-current={step.key === "unsent" ? "step" : undefined}
                className={cn(
                  "rounded-full px-2.5 py-0.5 text-xs",
                  step.key === "saved" && "bg-[#E8F6EF] text-[#13734E]",
                  step.key === "unsent" && "bg-[#FFF8EC] font-semibold text-[#7A4B00] shadow-[inset_0_0_0_1px_#F5DDB0]",
                  (step.key === "desk" || step.key === "scheduled") && "bg-[#F4F7FB] text-[#617183]",
                )}
              >
                {step.label}
              </li>
            ))}
          </ol>
        ) : null}
        <div className="mt-2 flex flex-wrap gap-2">
          {busy ? (
            <button
              type="button"
              onClick={onLater}
              className="inline-flex h-11 flex-1 items-center justify-center rounded-full bg-[#1E9BE6] px-5 text-[15px] font-semibold text-white hover:bg-[#178BD0]"
              data-testid="button-unsent-draft-ok"
            >
              حسنًا
            </button>
          ) : (
            <>
              <button
                type="button"
                onClick={onSubmitNow}
                className="inline-flex h-11 flex-1 items-center justify-center gap-2 rounded-full bg-[#1E9BE6] px-5 text-[15px] font-semibold text-white hover:bg-[#178BD0]"
                data-testid="button-unsent-draft-submit"
              >
                <Send className="h-4 w-4" />
                إرسال للمراجعة الآن
              </button>
              <button
                type="button"
                onClick={onLater}
                className="inline-flex h-11 items-center justify-center rounded-full bg-white px-5 text-[15px] font-semibold text-[#1B2B3A] shadow-[inset_0_0_0_1px_#DCE4EC] hover:bg-[#F7FAFC] dark:bg-card dark:text-foreground"
                data-testid="button-unsent-draft-later"
              >
                سأكمله لاحقًا
              </button>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
