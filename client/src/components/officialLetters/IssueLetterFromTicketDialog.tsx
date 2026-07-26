// إصدار شهادة تعريف مباشرة من تذكرة الاستفسار.
// عند النجاح يُرفق الرقم المرجعي في رد جاهز داخل الخيط ويُنزَّل الملف.

import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, apiUrl, queryClient } from "@/lib/queryClient";
import {
  OFFICIAL_LETTER_TYPE_LIST,
  OFFICIAL_LETTER_TYPE_META,
  type OfficialLetterType,
} from "@shared/officialLetters";
import { Loader2, ShieldCheck } from "lucide-react";

type SubjectPreview = {
  subject: { fullNameAr: string; roleTitleAr: string };
  gaps: { key: string; labelAr: string }[];
};

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  ticketId: string;
  subjectUserId: string;
  subjectName: string;
  /** يُستدعى بنص جاهز ليُملأ في مربع الرد. */
  onIssued?: (replyDraft: string) => void;
};

export function IssueLetterFromTicketDialog({
  open,
  onOpenChange,
  ticketId,
  subjectUserId,
  subjectName,
  onIssued,
}: Props) {
  const { toast } = useToast();
  const [letterType, setLetterType] = useState<OfficialLetterType>("media_license");
  const [recipientEntity, setRecipientEntity] = useState(
    OFFICIAL_LETTER_TYPE_META.media_license.defaultRecipientAr ?? "",
  );

  const { data: previewRaw, isFetching } = useQuery({
    queryKey: [`/api/official-letters/subjects/${subjectUserId}`],
    enabled: open && Boolean(subjectUserId),
  });
  const preview = (previewRaw ?? null) as SubjectPreview | null;

  const issueMutation = useMutation({
    mutationFn: async () =>
      apiRequest("/api/official-letters", {
        method: "POST",
        body: JSON.stringify({
          subjectUserId,
          letterType,
          recipientEntity: recipientEntity.trim() || null,
          ticketId,
        }),
        headers: { "Content-Type": "application/json" },
      }),
    onSuccess: (data: any) => {
      const reference = data?.letter?.referenceCode ?? "";
      queryClient.invalidateQueries({ queryKey: ["/api/official-letters"] });
      onOpenChange(false);
      toast({ title: "تم إصدار الخطاب", description: `الرقم المرجعي ${reference}` });
      if (data?.letter?.id) {
        window.open(apiUrl(`/api/official-letters/${data.letter.id}/file.pdf`), "_blank");
      }
      onIssued?.(
        `تم إصدار خطاب التعريف المطلوب برقم مرجعي ${reference}. ` +
          `يمكنك تنزيله من مساحتك في لوحة التحكم ضمن «خطاباتي الرسمية».`,
      );
    },
    onError: (error: Error) => {
      toast({
        variant: "destructive",
        title: "تعذر إصدار الخطاب",
        description: error.message || "حاول مرة أخرى",
      });
    },
  });

  const onTypeChange = (value: string) => {
    const next = value as OfficialLetterType;
    setLetterType(next);
    setRecipientEntity(OFFICIAL_LETTER_TYPE_META[next].defaultRecipientAr ?? "");
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent dir="rtl" className="max-w-md">
        <DialogHeader>
          <DialogTitle>إصدار شهادة تعريف</DialogTitle>
          <DialogDescription>للمنسوب: {subjectName}</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label>نوع الخطاب</Label>
            <Select value={letterType} onValueChange={onTypeChange}>
              <SelectTrigger data-testid="select-ticket-letter-type">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {OFFICIAL_LETTER_TYPE_LIST.map((type) => (
                  <SelectItem key={type.id} value={type.id}>
                    {type.labelAr}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>الجهة الموجّه إليها</Label>
            <Input
              value={recipientEntity}
              onChange={(e) => setRecipientEntity(e.target.value)}
              placeholder="اتركه فارغاً لـ «لمن يهمه الأمر»"
              data-testid="input-ticket-recipient"
            />
          </div>

          {isFetching ? (
            <p className="text-xs text-muted-foreground">جارٍ قراءة بيانات المنسوب…</p>
          ) : preview ? (
            <div className="rounded-lg border bg-muted/30 p-3 text-sm">
              <p className="flex items-center gap-2 font-medium">
                <ShieldCheck className="h-4 w-4 text-emerald-600" />
                {preview.subject.fullNameAr} — {preview.subject.roleTitleAr}
              </p>
              {preview.gaps.length > 0 && (
                <p className="mt-1.5 text-xs text-amber-700 dark:text-amber-400">
                  حقول ناقصة ستُحذف: {preview.gaps.map((g) => g.labelAr).join("، ")}
                </p>
              )}
            </div>
          ) : (
            <p className="text-xs text-destructive">
              تعذر تكوين بيانات المنسوب — استكمل ملفه عبر الموارد البشرية أولاً
            </p>
          )}

          <div className="flex gap-2">
            <Button
              onClick={() => issueMutation.mutate()}
              disabled={!preview || issueMutation.isPending}
              data-testid="button-confirm-issue-from-ticket"
            >
              {issueMutation.isPending ? (
                <>
                  <Loader2 className="ml-2 h-4 w-4 animate-spin" />
                  جارٍ الإصدار…
                </>
              ) : (
                "إصدار وتنزيل"
              )}
            </Button>
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              إلغاء
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
