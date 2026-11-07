import { useEffect, useRef, useState } from "react";
import ReactCrop, { type Crop, type PixelCrop } from "react-image-crop";
import "react-image-crop/dist/ReactCrop.css";
import { ImagePlus, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import {
  BANNER_ASPECT,
  bannerOutputPlan,
  initialBannerRect,
} from "@/lib/infographicBannerCrop";

interface InfographicBannerCropDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** رابط الإنفوجرافيك الكامل (الصورة البارزة). */
  sourceUrl: string;
  /** آخر ملف إنفوجرافيك رُفع من الجهاز في هذه الجلسة — يغني عن تحميل الرابط. */
  localFile: File | null;
  /** يستلم صورة الواجهة الناتجة (JPEG 16:9) — يرجع true عند نجاح الرفع. */
  onCropped: (file: File) => Promise<boolean>;
}

type SourceState =
  | { status: "loading" }
  | { status: "ready"; objectUrl: string }
  | { status: "needs-file" };

/**
 * نافذة «اقتطاع من الإنفوجرافيك»: إطار 16:9 ثابت النسبة يحرّكه المحرر فوق
 * الإنفوجرافيك الطولي، والناتج يُرفع كصورة واجهة. الإنفوجرافيك الأصلي لا يتغير.
 */
export function InfographicBannerCropDialog({
  open,
  onOpenChange,
  sourceUrl,
  localFile,
  onCropped,
}: InfographicBannerCropDialogProps) {
  const { toast } = useToast();
  const [source, setSource] = useState<SourceState>({ status: "loading" });
  const [pickedFile, setPickedFile] = useState<File | null>(null);
  const [crop, setCrop] = useState<Crop>();
  const [pixelCrop, setPixelCrop] = useState<PixelCrop | null>(null);
  const [isApplying, setIsApplying] = useState(false);
  const imgRef = useRef<HTMLImageElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // نحمّل الصورة كـ blob محلي حتى تقبل اللوحة الرسم منها. إن رفض الخادم
  // (CORS) نطلب من المحرر اختيار الملف من جهازه.
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    let objectUrl: string | null = null;
    setCrop(undefined);
    setPixelCrop(null);

    const fileToUse = pickedFile ?? localFile;
    if (fileToUse) {
      objectUrl = URL.createObjectURL(fileToUse);
      setSource({ status: "ready", objectUrl });
    } else if (!sourceUrl) {
      setSource({ status: "needs-file" });
    } else {
      setSource({ status: "loading" });
      fetch(sourceUrl, { mode: "cors", credentials: "omit" })
        .then((res) => {
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          return res.blob();
        })
        .then((blob) => {
          if (cancelled) return;
          objectUrl = URL.createObjectURL(blob);
          setSource({ status: "ready", objectUrl });
        })
        .catch(() => {
          if (!cancelled) setSource({ status: "needs-file" });
        });
    }

    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [open, sourceUrl, localFile, pickedFile]);

  useEffect(() => {
    if (!open) setPickedFile(null);
  }, [open]);

  const handleImageLoad = () => {
    const img = imgRef.current;
    if (!img) return;
    const rect = initialBannerRect(img.width, img.height);
    const initial: PixelCrop = { unit: "px", ...rect };
    setCrop(initial);
    setPixelCrop(initial);
  };

  const handleApply = async () => {
    const img = imgRef.current;
    if (!img || !pixelCrop) return;
    const scaleX = img.naturalWidth / img.width;
    const scaleY = img.naturalHeight / img.height;
    const plan = bannerOutputPlan(
      {
        x: pixelCrop.x * scaleX,
        y: pixelCrop.y * scaleY,
        width: pixelCrop.width * scaleX,
        height: pixelCrop.height * scaleY,
      },
      img.naturalWidth,
      img.naturalHeight,
    );
    if (!plan) {
      toast({ title: "حدّد جزءًا من الإنفوجرافيك أولًا", variant: "destructive" });
      return;
    }

    setIsApplying(true);
    try {
      const canvas = document.createElement("canvas");
      canvas.width = plan.outWidth;
      canvas.height = plan.outHeight;
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("canvas unavailable");
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.imageSmoothingQuality = "high";
      ctx.drawImage(
        img,
        plan.source.x,
        plan.source.y,
        plan.source.width,
        plan.source.height,
        0,
        0,
        plan.outWidth,
        plan.outHeight,
      );
      const blob = await new Promise<Blob>((resolve, reject) => {
        canvas.toBlob(
          (b) => (b ? resolve(b) : reject(new Error("toBlob failed"))),
          "image/jpeg",
          0.9,
        );
      });
      const file = new File([blob], `infographic-banner-${Date.now()}.jpg`, {
        type: "image/jpeg",
      });
      const ok = await onCropped(file);
      if (ok) onOpenChange(false);
    } catch (error) {
      console.error("Infographic banner crop failed:", error);
      toast({
        title: "تعذر اقتطاع الصورة",
        description: "جرّب اختيار ملف الإنفوجرافيك من جهازك.",
        variant: "destructive",
      });
    } finally {
      setIsApplying(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(next) => !isApplying && onOpenChange(next)}>
      <DialogContent className="max-h-[92vh] max-w-3xl overflow-y-auto" dir="rtl">
        <DialogHeader>
          <DialogTitle>اقتطاع صورة الواجهة من الإنفوجرافيك</DialogTitle>
          <DialogDescription>
            حرّك الإطار إلى الجزء الأوضح، عادة العنوان والرقم الأكبر. الإنفوجرافيك الأصلي لا يتغير.
          </DialogDescription>
        </DialogHeader>

        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            e.target.value = "";
            if (f) setPickedFile(f);
          }}
        />

        <div className="flex min-h-[240px] items-center justify-center rounded-2xl bg-muted/40 p-3">
          {source.status === "loading" && (
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" aria-label="جارٍ تحميل الإنفوجرافيك" />
          )}
          {source.status === "needs-file" && (
            <div className="flex max-w-sm flex-col items-center gap-3 text-center text-sm text-muted-foreground">
              <p>تعذر فتح الإنفوجرافيك من الرابط. اختر الملف نفسه من جهازك للاقتطاع منه.</p>
              <Button
                type="button"
                variant="outline"
                className="gap-2 rounded-full"
                onClick={() => fileInputRef.current?.click()}
                data-testid="button-crop-pick-file"
              >
                <ImagePlus className="h-4 w-4" />
                اختيار ملف الإنفوجرافيك
              </Button>
            </div>
          )}
          {source.status === "ready" && (
            <ReactCrop
              crop={crop}
              aspect={BANNER_ASPECT}
              keepSelection
              onChange={(c) => setCrop(c)}
              onComplete={(c) => setPixelCrop(c)}
              minWidth={60}
              style={{ maxHeight: "60vh" }}
            >
              <img
                ref={imgRef}
                src={source.objectUrl}
                alt="الإنفوجرافيك الكامل"
                className="h-auto max-h-[60vh] w-auto max-w-full"
                onLoad={handleImageLoad}
                data-testid="img-infographic-crop-source"
              />
            </ReactCrop>
          )}
        </div>

        <p className="text-xs leading-6 text-muted-foreground">
          الأفضل دائمًا صورة عرضية صممها فريق الجرافيك. الاقتطاع حل سريع حين لا تتوفر.
        </p>

        <DialogFooter className="gap-2 sm:justify-start">
          <Button
            type="button"
            onClick={handleApply}
            disabled={source.status !== "ready" || !pixelCrop || isApplying}
            className="gap-2 rounded-full"
            data-testid="button-apply-infographic-crop"
          >
            {isApplying && <Loader2 className="h-4 w-4 animate-spin" />}
            اعتماد كصورة واجهة
          </Button>
          <Button
            type="button"
            variant="outline"
            className="rounded-full"
            onClick={() => onOpenChange(false)}
            disabled={isApplying}
          >
            إلغاء
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
