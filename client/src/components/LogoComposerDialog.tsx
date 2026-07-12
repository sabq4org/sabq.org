import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ArrowLeftRight, Loader2, Upload, X } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { renderFittedLogo, renderMergedLogos } from "@/lib/logoCanvas";

interface LogoComposerDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** يستلم الصورة النهائية (16:9 بخلفية بيضاء) — يرجع true عند نجاح الرفع */
  onImageReady: (file: File) => Promise<boolean>;
}

const ACCEPTED_TYPES =
  "image/jpeg,image/jpg,image/png,image/webp,image/gif,image/svg+xml";
const MAX_SOURCE_SIZE = 10 * 1024 * 1024;

interface LogoSlotProps {
  label: string;
  file: File | null;
  onSelect: (file: File) => void;
  onClear: () => void;
  testId: string;
}

function LogoSlot({ label, file, onSelect, onClear, testId }: LogoSlotProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [thumbUrl, setThumbUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!file) {
      setThumbUrl(null);
      return;
    }
    const url = URL.createObjectURL(file);
    setThumbUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      <div
        className="relative border-2 border-dashed rounded-lg p-3 text-center cursor-pointer hover-elevate min-h-[96px] flex items-center justify-center"
        onClick={() => inputRef.current?.click()}
        data-testid={testId}
      >
        <input
          ref={inputRef}
          type="file"
          accept={ACCEPTED_TYPES}
          className="hidden"
          onChange={(e) => {
            const selected = e.target.files?.[0];
            if (selected) onSelect(selected);
            e.target.value = "";
          }}
        />
        {file && thumbUrl ? (
          <>
            <img
              src={thumbUrl}
              alt={file.name}
              className="max-h-20 max-w-full object-contain mx-auto"
            />
            <Button
              variant="ghost"
              size="icon"
              className="absolute top-1 left-1 h-6 w-6"
              onClick={(e) => {
                e.stopPropagation();
                onClear();
              }}
              data-testid={`${testId}-clear`}
            >
              <X className="h-4 w-4" />
            </Button>
          </>
        ) : (
          <div className="text-muted-foreground">
            <Upload className="h-6 w-6 mx-auto mb-1" />
            <p className="text-xs">اضغط لاختيار الشعار</p>
          </div>
        )}
      </div>
    </div>
  );
}

export function LogoComposerDialog({
  open,
  onOpenChange,
  onImageReady,
}: LogoComposerDialogProps) {
  const { toast } = useToast();
  const [tab, setTab] = useState<"fit" | "merge">("fit");

  const [fitFile, setFitFile] = useState<File | null>(null);
  const [firstLogo, setFirstLogo] = useState<File | null>(null);
  const [secondLogo, setSecondLogo] = useState<File | null>(null);
  const [showDivider, setShowDivider] = useState(false);

  const [previewBlob, setPreviewBlob] = useState<Blob | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [isRendering, setIsRendering] = useState(false);
  const [isApplying, setIsApplying] = useState(false);

  // توليد المعاينة عند أي تغيير في المدخلات — توكن لتجاهل النتائج المتأخرة
  const renderTokenRef = useRef(0);

  useEffect(() => {
    const token = ++renderTokenRef.current;
    const generate = async () => {
      const ready =
        tab === "fit" ? fitFile !== null : firstLogo !== null && secondLogo !== null;
      if (!ready) {
        setPreviewBlob(null);
        return;
      }
      setIsRendering(true);
      try {
        const blob =
          tab === "fit"
            ? await renderFittedLogo(fitFile!)
            : await renderMergedLogos(firstLogo!, secondLogo!, {
                divider: showDivider,
              });
        if (renderTokenRef.current === token) setPreviewBlob(blob);
      } catch (error) {
        console.error("Logo render error:", error);
        if (renderTokenRef.current === token) {
          setPreviewBlob(null);
          toast({
            title: "تعذرت معالجة الشعار",
            description:
              error instanceof Error ? error.message : "ملف الصورة غير مدعوم",
            variant: "destructive",
          });
        }
      } finally {
        if (renderTokenRef.current === token) setIsRendering(false);
      }
    };
    generate();
  }, [tab, fitFile, firstLogo, secondLogo, showDivider, toast]);

  useEffect(() => {
    if (!previewBlob) {
      setPreviewUrl(null);
      return;
    }
    const url = URL.createObjectURL(previewBlob);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [previewBlob]);

  const validateAndSet = (file: File, setter: (f: File) => void) => {
    if (!file.type.startsWith("image/")) {
      toast({
        title: "خطأ",
        description: "الرجاء اختيار ملف صورة فقط",
        variant: "destructive",
      });
      return;
    }
    if (file.size > MAX_SOURCE_SIZE) {
      toast({
        title: "خطأ",
        description: "حجم الشعار يجب أن يكون أقل من 10 ميجابايت",
        variant: "destructive",
      });
      return;
    }
    setter(file);
  };

  const resetState = () => {
    renderTokenRef.current++;
    setFitFile(null);
    setFirstLogo(null);
    setSecondLogo(null);
    setShowDivider(false);
    setPreviewBlob(null);
    setTab("fit");
  };

  const handleDialogChange = (nextOpen: boolean) => {
    if (!nextOpen && isApplying) return;
    if (!nextOpen) resetState();
    onOpenChange(nextOpen);
  };

  const handleApply = async () => {
    if (!previewBlob) return;
    setIsApplying(true);
    try {
      const name = tab === "fit" ? "logo-fit" : "logo-merge";
      const file = new File([previewBlob], `${name}-${Date.now()}.jpg`, {
        type: "image/jpeg",
      });
      const success = await onImageReady(file);
      if (success) {
        resetState();
        onOpenChange(false);
      }
    } finally {
      setIsApplying(false);
    }
  };

  const canApply = previewBlob !== null && !isRendering && !isApplying;

  return (
    <Dialog open={open} onOpenChange={handleDialogChange}>
      <DialogContent className="sm:max-w-[640px]">
        <DialogHeader>
          <DialogTitle>أدوات الشعار</DialogTitle>
          <DialogDescription>
            معالجة صور الشعارات لتظهر كاملة على خلفية بيضاء بمقاس 16:9 دون قص.
          </DialogDescription>
        </DialogHeader>

        <Tabs value={tab} onValueChange={(v) => setTab(v as "fit" | "merge")}>
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="fit" data-testid="tab-fit-logo">
              ضبط شعار
            </TabsTrigger>
            <TabsTrigger value="merge" data-testid="tab-merge-logos">
              دمج شعارين
            </TabsTrigger>
          </TabsList>

          <TabsContent value="fit" className="space-y-4 pt-2">
            <LogoSlot
              label="الشعار"
              file={fitFile}
              onSelect={(f) => validateAndSet(f, setFitFile)}
              onClear={() => setFitFile(null)}
              testId="slot-fit-logo"
            />
          </TabsContent>

          <TabsContent value="merge" className="space-y-4 pt-2">
            <div className="grid grid-cols-2 gap-3">
              <LogoSlot
                label="الشعار الأول (يمين)"
                file={firstLogo}
                onSelect={(f) => validateAndSet(f, setFirstLogo)}
                onClear={() => setFirstLogo(null)}
                testId="slot-first-logo"
              />
              <LogoSlot
                label="الشعار الثاني (يسار)"
                file={secondLogo}
                onSelect={(f) => validateAndSet(f, setSecondLogo)}
                onClear={() => setSecondLogo(null)}
                testId="slot-second-logo"
              />
            </div>
            <div className="flex flex-wrap items-center gap-4">
              <Button
                variant="outline"
                size="sm"
                className="gap-2"
                disabled={!firstLogo || !secondLogo}
                onClick={() => {
                  setFirstLogo(secondLogo);
                  setSecondLogo(firstLogo);
                }}
                data-testid="button-swap-logos"
              >
                <ArrowLeftRight className="h-4 w-4" />
                تبديل الترتيب
              </Button>
              <div className="flex items-center gap-2">
                <Switch
                  id="logo-divider"
                  checked={showDivider}
                  onCheckedChange={setShowDivider}
                  data-testid="switch-logo-divider"
                />
                <Label htmlFor="logo-divider" className="text-sm cursor-pointer">
                  خط فاصل بين الشعارين
                </Label>
              </div>
            </div>
          </TabsContent>
        </Tabs>

        {/* المعاينة النهائية */}
        <div className="space-y-2">
          <Label>المعاينة النهائية (1200×675)</Label>
          <div className="relative aspect-video w-full overflow-hidden rounded-lg border bg-muted/30">
            {previewUrl ? (
              <img
                src={previewUrl}
                alt="معاينة الشعار"
                className="h-full w-full object-contain"
                data-testid="img-logo-preview"
              />
            ) : (
              <div className="h-full w-full flex items-center justify-center text-sm text-muted-foreground">
                {isRendering ? (
                  <Loader2 className="h-6 w-6 animate-spin" />
                ) : tab === "fit" ? (
                  "اختر الشعار لعرض المعاينة"
                ) : (
                  "اختر الشعارين لعرض المعاينة"
                )}
              </div>
            )}
            {isRendering && previewUrl && (
              <div className="absolute inset-0 bg-background/50 flex items-center justify-center">
                <Loader2 className="h-6 w-6 animate-spin" />
              </div>
            )}
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button
            variant="outline"
            onClick={() => handleDialogChange(false)}
            disabled={isApplying}
          >
            إلغاء
          </Button>
          <Button
            onClick={handleApply}
            disabled={!canApply}
            className="gap-2"
            data-testid="button-apply-logo-image"
          >
            {isApplying && <Loader2 className="h-4 w-4 animate-spin" />}
            استخدام كصورة الخبر
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
