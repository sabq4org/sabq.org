import { useEffect, useRef, useState, type SyntheticEvent } from "react";
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
import { ArrowLeftRight, Loader2, Upload, X, ZoomIn, ZoomOut } from "lucide-react";
import ReactCrop, { type Crop, type PixelCrop } from "react-image-crop";
import "react-image-crop/dist/ReactCrop.css";
import { useToast } from "@/hooks/use-toast";
import {
  detectFaceFocalPoint,
  minPhotoZoom,
  renderCroppedImage,
  renderFittedLogo,
  renderMergedLogos,
  renderMergedPhotos,
  type CropRect,
  type FocalPoint,
} from "@/lib/logoCanvas";

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
  /** عند تمريرهما: النقر على الصورة يحدد نقطة التركيز (وجه الشخص) بدل فتح منتقي الملفات */
  focal?: FocalPoint | null;
  onFocalChange?: (focal: FocalPoint) => void;
}

function LogoSlot({ label, file, onSelect, onClear, testId, focal, onFocalChange }: LogoSlotProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [thumbUrl, setThumbUrl] = useState<string | null>(null);
  const focalMode = Boolean(onFocalChange);

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
            <span
              className={`relative inline-block ${focalMode ? "cursor-crosshair" : ""}`}
              onClick={(e) => {
                if (!focalMode) return;
                e.stopPropagation();
                const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
                onFocalChange!({
                  fx: (e.clientX - rect.left) / rect.width,
                  fy: (e.clientY - rect.top) / rect.height,
                });
              }}
              data-testid={`${testId}-focal-area`}
            >
              <img
                src={thumbUrl}
                alt={file.name}
                className={`${focalMode ? "max-h-32" : "max-h-20"} max-w-full object-contain mx-auto`}
              />
              {focalMode && focal && (
                <span
                  className="pointer-events-none absolute h-5 w-5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white bg-primary/60 shadow ring-1 ring-black/30"
                  style={{ left: `${focal.fx * 100}%`, top: `${focal.fy * 100}%` }}
                  data-testid={`${testId}-focal-marker`}
                />
              )}
            </span>
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
            <p className="text-xs">{focalMode ? "اضغط لاختيار الصورة" : "اضغط لاختيار الشعار"}</p>
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
  const [tab, setTab] = useState<"fit" | "merge" | "photos" | "crop">("fit");

  const [fitFile, setFitFile] = useState<File | null>(null);
  const [firstLogo, setFirstLogo] = useState<File | null>(null);
  const [secondLogo, setSecondLogo] = useState<File | null>(null);
  const [showDivider, setShowDivider] = useState(false);
  const [firstPhoto, setFirstPhoto] = useState<File | null>(null);
  const [secondPhoto, setSecondPhoto] = useState<File | null>(null);
  const [firstFocal, setFirstFocal] = useState<FocalPoint | null>(null);
  const [secondFocal, setSecondFocal] = useState<FocalPoint | null>(null);
  const [firstDims, setFirstDims] = useState<{ w: number; h: number } | null>(null);
  const [secondDims, setSecondDims] = useState<{ w: number; h: number } | null>(null);
  // تكبير نسبةً إلى cover: ‏1 = ملء النصف، أقل = تصغير يُظهر جزءاً أكبر
  const [firstZoom, setFirstZoom] = useState(1);
  const [secondZoom, setSecondZoom] = useState(1);

  // حالة الاقتصاص الحر: التحديد بالنسبة المئوية للعرض + مكافئه ببكسل الصورة الأصلية
  const [cropFile, setCropFile] = useState<File | null>(null);
  const [cropImageUrl, setCropImageUrl] = useState<string | null>(null);
  const [crop, setCrop] = useState<Crop | undefined>(undefined);
  const [cropRect, setCropRect] = useState<CropRect | null>(null);
  const cropImgRef = useRef<HTMLImageElement>(null);

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
        tab === "fit"
          ? fitFile !== null
          : tab === "merge"
            ? firstLogo !== null && secondLogo !== null
            : tab === "crop"
              ? cropFile !== null && cropRect !== null
              : firstPhoto !== null && secondPhoto !== null;
      if (!ready) {
        setPreviewBlob(null);
        return;
      }
      setIsRendering(true);
      try {
        const blob =
          tab === "fit"
            ? await renderFittedLogo(fitFile!)
            : tab === "merge"
              ? await renderMergedLogos(firstLogo!, secondLogo!, {
                  divider: showDivider,
                })
              : tab === "crop"
                ? await renderCroppedImage(cropFile!, cropRect!)
                : await renderMergedPhotos(firstPhoto!, secondPhoto!, {
                    firstFocal,
                    secondFocal,
                    firstZoom,
                    secondZoom,
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
  }, [tab, fitFile, firstLogo, secondLogo, showDivider, firstPhoto, secondPhoto, firstFocal, secondFocal, firstZoom, secondZoom, cropFile, cropRect, toast]);

  // رابط عرض صورة الاقتصاص داخل أداة التحديد
  useEffect(() => {
    if (!cropFile) {
      setCropImageUrl(null);
      return;
    }
    const url = URL.createObjectURL(cropFile);
    setCropImageUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [cropFile]);

  const selectCropFile = (file: File) => {
    setCrop(undefined);
    setCropRect(null);
    setCropFile(file);
  };

  const clearCropFile = () => {
    setCropFile(null);
    setCrop(undefined);
    setCropRect(null);
  };

  // عند تحميل الصورة في أداة التحديد: تحديد افتراضي متمركز يغطي 80%
  const handleCropImageLoad = (e: SyntheticEvent<HTMLImageElement>) => {
    const img = e.currentTarget;
    setCrop({ unit: "%", x: 10, y: 10, width: 80, height: 80 });
    setCropRect({
      x: img.naturalWidth * 0.1,
      y: img.naturalHeight * 0.1,
      width: img.naturalWidth * 0.8,
      height: img.naturalHeight * 0.8,
    });
  };

  // تحويل تحديد المعاينة (بكسل معروض) إلى بكسل الصورة الأصلية
  const handleCropComplete = (pixelCrop: PixelCrop) => {
    const img = cropImgRef.current;
    if (!img || !img.width || !img.height) return;
    if (pixelCrop.width < 1 || pixelCrop.height < 1) return;
    const scaleX = img.naturalWidth / img.width;
    const scaleY = img.naturalHeight / img.height;
    setCropRect({
      x: pixelCrop.x * scaleX,
      y: pixelCrop.y * scaleY,
      width: pixelCrop.width * scaleX,
      height: pixelCrop.height * scaleY,
    });
  };

  // اكتشاف تلقائي لوجه الشخص عند اختيار صورة (Chrome/Edge — في Safari
  // يبقى التوسيط الافتراضي ويعدّل المحرر الموضع بالسحب داخل المعاينة)
  const selectPhoto = (
    file: File,
    setFile: (f: File) => void,
    setFocal: (f: FocalPoint | null) => void,
    setDims: (d: { w: number; h: number } | null) => void,
  ) => {
    setFile(file);
    setFocal(null);
    setDims(null);
    if (setFile === setFirstPhoto) setFirstZoom(1);
    else setSecondZoom(1);
    createImageBitmap(file)
      .then((bitmap) => {
        setDims({ w: bitmap.width, h: bitmap.height });
        bitmap.close();
      })
      .catch(() => setDims(null));
    detectFaceFocalPoint(file).then((focal) => {
      if (focal) setFocal(focal);
    });
  };

  // ── سحب الصورة داخل المعاينة (photos): تحريك نافذة القص مباشرة ──
  // نسبة النصف في اللوحة النهائية: (1200-14)/2 على 675
  const HALF_RATIO = (1200 - 14) / 2 / 675;

  // كسر القص في كل محور: أي جزء من الصورة تُظهره النافذة عند zoom الحالي —
  // يحوّل مسافة السحب على الشاشة إلى إزاحة مكافئة في إحداثيات نقطة التركيز
  const cropFractions = (dims: { w: number; h: number } | null, zoom: number) => {
    if (!dims) return { fxFrac: 0.5, fyFrac: 0.5 };
    const ratio = dims.w / dims.h;
    const base =
      ratio > HALF_RATIO
        ? { fxFrac: (dims.h * HALF_RATIO) / dims.w, fyFrac: 1 }
        : { fxFrac: 1, fyFrac: dims.w / HALF_RATIO / dims.h };
    return {
      fxFrac: Math.min(1, base.fxFrac / zoom),
      fyFrac: Math.min(1, base.fyFrac / zoom),
    };
  };

  // حدود التصغير: لا معنى للنزول تحت ظهور الصورة كاملة (contain)
  const zoomBounds = (dims: { w: number; h: number } | null) => ({
    min: dims ? Math.max(minPhotoZoom(dims), 0.2) : 0.4,
    max: 2,
  });

  const stepZoom = (side: "first" | "second", direction: 1 | -1) => {
    const dims = side === "first" ? firstDims : secondDims;
    const setZoom = side === "first" ? setFirstZoom : setSecondZoom;
    const { min, max } = zoomBounds(dims);
    setZoom((z) => Math.min(max, Math.max(min, z * (direction === 1 ? 1.15 : 1 / 1.15))));
  };

  const dragRef = useRef<{
    side: "first" | "second";
    startX: number;
    startY: number;
    startFocal: FocalPoint;
  } | null>(null);

  const clamp01 = (v: number) => Math.min(Math.max(v, 0), 1);

  const handlePreviewPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (tab !== "photos" || !previewUrl) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const xRel = (e.clientX - rect.left) / rect.width;
    // النصف الأيمن (فيزيائياً) = الصورة الأولى
    const side = xRel >= 0.5 ? "first" : "second";
    const startFocal =
      side === "first" ? (firstFocal ?? { fx: 0.5, fy: 0.5 }) : (secondFocal ?? { fx: 0.5, fy: 0.5 });
    dragRef.current = { side, startX: e.clientX, startY: e.clientY, startFocal };
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const handlePreviewPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const halfDispW = rect.width * ((1200 - 14) / 2 / 1200);
    const dims = drag.side === "first" ? firstDims : secondDims;
    const { fxFrac, fyFrac } = cropFractions(dims, drag.side === "first" ? firstZoom : secondZoom);
    // سحب المحتوى يميناً = كشف الجزء الأيسر = نقطة التركيز تتحرك يساراً
    const dfx = (-(e.clientX - drag.startX) / halfDispW) * fxFrac;
    const dfy = (-(e.clientY - drag.startY) / rect.height) * fyFrac;
    const next = {
      fx: clamp01(drag.startFocal.fx + dfx),
      fy: clamp01(drag.startFocal.fy + dfy),
    };
    if (drag.side === "first") setFirstFocal(next);
    else setSecondFocal(next);
  };

  const handlePreviewPointerUp = () => {
    dragRef.current = null;
  };

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
    setFirstPhoto(null);
    setSecondPhoto(null);
    setFirstFocal(null);
    setSecondFocal(null);
    setFirstDims(null);
    setSecondDims(null);
    setFirstZoom(1);
    setSecondZoom(1);
    setCropFile(null);
    setCrop(undefined);
    setCropRect(null);
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
      const name =
        tab === "fit"
          ? "logo-fit"
          : tab === "merge"
            ? "logo-merge"
            : tab === "crop"
              ? "image-crop"
              : "photo-merge";
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
            معالجة الشعارات والصور لصورة خبر بمقاس 16:9 جاهزة للنشر دون قص عشوائي.
          </DialogDescription>
        </DialogHeader>

        <Tabs
          value={tab}
          onValueChange={(v) => setTab(v as "fit" | "merge" | "photos" | "crop")}
        >
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="fit" data-testid="tab-fit-logo">
              ضبط شعار
            </TabsTrigger>
            <TabsTrigger value="merge" data-testid="tab-merge-logos">
              دمج شعارين
            </TabsTrigger>
            <TabsTrigger value="photos" data-testid="tab-merge-photos">
              دمج صورتين
            </TabsTrigger>
            <TabsTrigger value="crop" data-testid="tab-crop-image">
              اقتصاص حر
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

          <TabsContent value="photos" className="space-y-4 pt-2">
            <div className="grid grid-cols-2 gap-3">
              <LogoSlot
                label="الصورة الأولى (يمين)"
                file={firstPhoto}
                onSelect={(f) =>
                  validateAndSet(f, (file) => selectPhoto(file, setFirstPhoto, setFirstFocal, setFirstDims))
                }
                onClear={() => {
                  setFirstPhoto(null);
                  setFirstFocal(null);
                  setFirstDims(null);
                }}
                focal={firstFocal}
                onFocalChange={setFirstFocal}
                testId="slot-first-photo"
              />
              <LogoSlot
                label="الصورة الثانية (يسار)"
                file={secondPhoto}
                onSelect={(f) =>
                  validateAndSet(f, (file) => selectPhoto(file, setSecondPhoto, setSecondFocal, setSecondDims))
                }
                onClear={() => {
                  setSecondPhoto(null);
                  setSecondFocal(null);
                  setSecondDims(null);
                }}
                focal={secondFocal}
                onFocalChange={setSecondFocal}
                testId="slot-second-photo"
              />
            </div>
            <div className="flex flex-wrap items-center gap-4">
              <Button
                variant="outline"
                size="sm"
                className="gap-2"
                disabled={!firstPhoto || !secondPhoto}
                onClick={() => {
                  setFirstPhoto(secondPhoto);
                  setSecondPhoto(firstPhoto);
                  setFirstFocal(secondFocal);
                  setSecondFocal(firstFocal);
                  setFirstDims(secondDims);
                  setSecondDims(firstDims);
                  setFirstZoom(secondZoom);
                  setSecondZoom(firstZoom);
                }}
                data-testid="button-swap-photos"
              >
                <ArrowLeftRight className="h-4 w-4" />
                تبديل الترتيب
              </Button>
              <p className="text-xs text-muted-foreground">
                كل صورة تملأ نصفها بالكامل وبينهما فراغ أبيض رفيع. الوجوه تُكتشف تلقائياً
                حيث يدعم المتصفح ذلك، و<strong>اسحب الصورة داخل المعاينة بالأسفل</strong>
                {" "}لضبط موضعها يدوياً فلا يُبتر الوجه.
              </p>
            </div>
          </TabsContent>

          <TabsContent value="crop" className="space-y-4 pt-2">
            {!cropFile ? (
              <LogoSlot
                label="الصورة"
                file={null}
                onSelect={(f) => validateAndSet(f, selectCropFile)}
                onClear={clearCropFile}
                testId="slot-crop-image"
              />
            ) : (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label>اسحب المقابض لتحديد منطقة الاقتصاص</Label>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="gap-1"
                    onClick={clearCropFile}
                    data-testid="button-clear-crop-image"
                  >
                    <X className="h-4 w-4" />
                    إزالة الصورة
                  </Button>
                </div>
                {/* أداة التحديد تحسب المواضع بإحداثيات فيزيائية — نعزلها عن اتجاه RTL */}
                <div
                  dir="ltr"
                  className="flex justify-center rounded-lg border bg-muted/30 p-2"
                >
                  {cropImageUrl && (
                    <ReactCrop
                      crop={crop}
                      onChange={(_, percentCrop) => setCrop(percentCrop)}
                      onComplete={handleCropComplete}
                      minWidth={20}
                      minHeight={20}
                    >
                      <img
                        ref={cropImgRef}
                        src={cropImageUrl}
                        alt="صورة للاقتصاص"
                        className="max-h-[320px]"
                        onLoad={handleCropImageLoad}
                        data-testid="img-crop-source"
                      />
                    </ReactCrop>
                  )}
                </div>
                <p className="text-xs text-muted-foreground">
                  القصّة توضع متمركزة على لوحة بيضاء 16:9 — القص يتم على أبعاد
                  الصورة الأصلية فلا تُفقد الجودة.
                </p>
              </div>
            )}
          </TabsContent>
        </Tabs>

        {/* المعاينة النهائية — في دمج الصورتين: اسحب أي نصف لضبط موضع صورته */}
        <div className="space-y-2">
          <Label>
            المعاينة النهائية (1200×675)
            {tab === "photos" && previewUrl && (
              <span className="mr-2 text-[11px] font-normal text-muted-foreground">
                — اسحب أي صورة لتحريكها داخل نصفها
              </span>
            )}
          </Label>
          <div
            className={`relative aspect-video w-full overflow-hidden rounded-lg border bg-muted/30 ${
              tab === "photos" && previewUrl ? "cursor-grab active:cursor-grabbing touch-none select-none" : ""
            }`}
            onPointerDown={handlePreviewPointerDown}
            onPointerMove={handlePreviewPointerMove}
            onPointerUp={handlePreviewPointerUp}
            onPointerCancel={handlePreviewPointerUp}
            data-testid="preview-container"
          >
            {previewUrl ? (
              <>
                <img
                  src={previewUrl}
                  alt="معاينة الشعار"
                  className="h-full w-full object-contain"
                  draggable={false}
                  data-testid="img-logo-preview"
                />
                {/* أزرار تكبير/تصغير لكل نصف — تظهر في دمج الصورتين فقط */}
                {tab === "photos" && (
                  <>
                    <div className="absolute top-2 right-2 flex gap-1" onPointerDown={(e) => e.stopPropagation()}>
                      <Button
                        variant="secondary"
                        size="icon"
                        className="h-7 w-7 bg-background/80 backdrop-blur border shadow-sm"
                        onClick={() => stepZoom("first", -1)}
                        title="تصغير الصورة اليمنى"
                        data-testid="button-zoom-out-first"
                      >
                        <ZoomOut className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        variant="secondary"
                        size="icon"
                        className="h-7 w-7 bg-background/80 backdrop-blur border shadow-sm"
                        onClick={() => stepZoom("first", 1)}
                        title="تكبير الصورة اليمنى"
                        data-testid="button-zoom-in-first"
                      >
                        <ZoomIn className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                    <div className="absolute top-2 left-2 flex gap-1" onPointerDown={(e) => e.stopPropagation()}>
                      <Button
                        variant="secondary"
                        size="icon"
                        className="h-7 w-7 bg-background/80 backdrop-blur border shadow-sm"
                        onClick={() => stepZoom("second", -1)}
                        title="تصغير الصورة اليسرى"
                        data-testid="button-zoom-out-second"
                      >
                        <ZoomOut className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        variant="secondary"
                        size="icon"
                        className="h-7 w-7 bg-background/80 backdrop-blur border shadow-sm"
                        onClick={() => stepZoom("second", 1)}
                        title="تكبير الصورة اليسرى"
                        data-testid="button-zoom-in-second"
                      >
                        <ZoomIn className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </>
                )}
              </>
            ) : (
              <div className="h-full w-full flex items-center justify-center text-sm text-muted-foreground">
                {isRendering ? (
                  <Loader2 className="h-6 w-6 animate-spin" />
                ) : tab === "fit" ? (
                  "اختر الشعار لعرض المعاينة"
                ) : tab === "merge" ? (
                  "اختر الشعارين لعرض المعاينة"
                ) : tab === "crop" ? (
                  "اختر الصورة لعرض المعاينة"
                ) : (
                  "اختر الصورتين لعرض المعاينة"
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
