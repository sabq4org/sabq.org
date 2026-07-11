import { useEffect, useState } from "react";
import { Check, Copy, Download, Loader2, Share2 } from "lucide-react";
import gulfCupLogo from "@assets/gulf-cup-27-logo-horizontal.svg";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import type { GcMajlisHarvestAward, GcMajlisSummary } from "./gcMajlisTypes";

function inviteUrl(code: string): string {
  const origin = typeof window === "undefined" ? "https://sabq.org" : window.location.origin;
  return `${origin}/gulf-cup/majlis?code=${encodeURIComponent(code)}`;
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("تعذّر تحميل شعار البطولة"));
    image.src = src;
  });
}

const CARD_WIDTH = 1080;
const CARD_HEIGHT = 1350;

function setFittedFont(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
  startSize: number,
  weight = 900,
): void {
  let size = startSize;
  do {
    ctx.font = `${weight} ${size}px "IBM Plex Sans Arabic", Arial, sans-serif`;
    if (ctx.measureText(text).width <= maxWidth) return;
    size -= 2;
  } while (size >= 34);
}

async function drawTournamentLogo(
  ctx: CanvasRenderingContext2D,
  centerX: number,
  y: number,
  maxWidth: number,
  height: number,
): Promise<void> {
  try {
    const logo = await loadImage(gulfCupLogo);
    const ratio = logo.naturalWidth / Math.max(logo.naturalHeight, 1);
    const width = Math.min(maxWidth, height * ratio);
    ctx.drawImage(logo, centerX - width / 2, y, width, height);
  } catch {
    // يبقى اسم البطولة مرئيًا حتى إذا فشل asset في متصفح قديم.
  }
}

async function renderCard(majlis: GcMajlisSummary): Promise<Blob> {
  await document.fonts?.ready;
  const canvas = document.createElement("canvas");
  canvas.width = CARD_WIDTH;
  canvas.height = CARD_HEIGHT;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("المتصفح لا يدعم إنشاء البطاقة");

  const gradient = ctx.createLinearGradient(0, 0, CARD_WIDTH, CARD_HEIGHT);
  gradient.addColorStop(0, "#041C22");
  gradient.addColorStop(0.55, "sky-600");
  gradient.addColorStop(1, "sky-500");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, CARD_WIDTH, CARD_HEIGHT);

  ctx.globalAlpha = 0.09;
  ctx.fillStyle = "#FFFFFF";
  for (let x = 38; x < CARD_WIDTH; x += 72) {
    for (let y = 38; y < CARD_HEIGHT; y += 72) {
      ctx.beginPath();
      ctx.arc(x, y, 3, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.globalAlpha = 1;

  ctx.fillStyle = "rgba(255,255,255,0.10)";
  ctx.beginPath();
  ctx.arc(50, 1270, 390, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "rgba(245,212,107,0.14)";
  ctx.beginPath();
  ctx.arc(1040, 10, 330, 0, Math.PI * 2);
  ctx.fill();

  await drawTournamentLogo(ctx, CARD_WIDTH / 2, 86, 330, 110);

  ctx.textAlign = "center";
  ctx.direction = "rtl";
  ctx.fillStyle = "#E0F2FE";
  ctx.font = '700 32px "IBM Plex Sans Arabic", Arial, sans-serif';
  ctx.fillText("دعوة خاصة إلى مجلس توقعات خليجي 27", CARD_WIDTH / 2, 285);

  ctx.fillStyle = "#FFFFFF";
  const safeName = majlis.name.length > 38 ? `${majlis.name.slice(0, 37)}…` : majlis.name;
  setFittedFont(ctx, safeName, 900, 82);
  ctx.fillText(safeName, CARD_WIDTH / 2, 420);

  ctx.fillStyle = "rgba(255,255,255,0.12)";
  const pillX = 140;
  const pillY = 535;
  const pillW = 800;
  const pillH = 180;
  ctx.beginPath();
  ctx.roundRect(pillX, pillY, pillW, pillH, 38);
  ctx.fill();
  ctx.strokeStyle = "rgba(245,212,107,0.55)";
  ctx.lineWidth = 3;
  ctx.stroke();

  ctx.direction = "rtl";
  ctx.textAlign = "center";
  ctx.fillStyle = "#E0F2FE";
  ctx.font = '700 25px "IBM Plex Sans Arabic", Arial, sans-serif';
  ctx.fillText("رمز الدعوة", CARD_WIDTH / 2, pillY + 52);
  ctx.direction = "ltr";
  ctx.fillStyle = "sky-300";
  ctx.font = '900 72px ui-monospace, "SFMono-Regular", monospace';
  ctx.fillText(majlis.code, CARD_WIDTH / 2, pillY + 132);

  ctx.direction = "rtl";
  ctx.textAlign = "center";
  ctx.fillStyle = "#FFFFFF";
  ctx.font = '800 42px "IBM Plex Sans Arabic", Arial, sans-serif';
  ctx.fillText("نافسنا… والمجلس يحلى بأهله", CARD_WIDTH / 2, 860);
  ctx.fillStyle = "#E0F2FE";
  ctx.font = '600 28px "IBM Plex Sans Arabic", Arial, sans-serif';
  ctx.fillText("توقّع قبل الصافرة، واكتشف توقعاتنا بعد الإقفال", CARD_WIDTH / 2, 925);

  ctx.fillStyle = "rgba(255,255,255,0.10)";
  ctx.beginPath();
  ctx.roundRect(115, 1055, 850, 135, 32);
  ctx.fill();
  ctx.fillStyle = "#FFFFFF";
  ctx.font = '800 30px "IBM Plex Sans Arabic", Arial, sans-serif';
  ctx.fillText("افتح الرابط وانضم مباشرةً", CARD_WIDTH / 2, 1110);
  ctx.fillStyle = "sky-300";
  ctx.font = '700 27px "IBM Plex Sans Arabic", Arial, sans-serif';
  ctx.fillText("sabq.org/gulf-cup/majlis", CARD_WIDTH / 2, 1158);

  ctx.fillStyle = "rgba(255,255,255,0.72)";
  ctx.font = '600 21px "IBM Plex Sans Arabic", Arial, sans-serif';
  ctx.fillText("سبق · منصة إخبارية سعودية ذكية", CARD_WIDTH / 2, 1285);

  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("تعذّر إنشاء صورة الدعوة"))), "image/png");
  });
}

const HARVEST_AWARDS = [
  { key: "champion", title: "بطل المجلس", emoji: "🏆" },
  { key: "accurate", title: "الأدق", emoji: "🎯" },
  { key: "bold", title: "الأجرأ", emoji: "🔥" },
  { key: "stubborn", title: "العنيد", emoji: "👑" },
] as const;

async function renderHarvestCard(majlisName: string, awards: GcMajlisHarvestAward[]): Promise<Blob> {
  await document.fonts?.ready;
  const canvas = document.createElement("canvas");
  canvas.width = CARD_WIDTH;
  canvas.height = CARD_HEIGHT;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("المتصفح لا يدعم إنشاء البطاقة");

  const gradient = ctx.createLinearGradient(0, 0, CARD_WIDTH, CARD_HEIGHT);
  gradient.addColorStop(0, "#041C22");
  gradient.addColorStop(0.52, "sky-600");
  gradient.addColorStop(1, "#38BDF8");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, CARD_WIDTH, CARD_HEIGHT);

  ctx.globalAlpha = 0.08;
  ctx.fillStyle = "#FFFFFF";
  for (let x = 42; x < CARD_WIDTH; x += 76) {
    for (let y = 42; y < CARD_HEIGHT; y += 76) {
      ctx.beginPath();
      ctx.arc(x, y, 3, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.globalAlpha = 1;

  await drawTournamentLogo(ctx, CARD_WIDTH / 2, 60, 290, 95);
  ctx.direction = "rtl";
  ctx.textAlign = "center";
  ctx.fillStyle = "sky-300";
  ctx.font = '800 30px "IBM Plex Sans Arabic", Arial, sans-serif';
  ctx.fillText("حصاد مجلس توقعات خليجي 27", CARD_WIDTH / 2, 225);
  ctx.fillStyle = "#FFFFFF";
  const safeName = majlisName.length > 38 ? `${majlisName.slice(0, 37)}…` : majlisName;
  setFittedFont(ctx, safeName, 900, 76);
  ctx.fillText(safeName, CARD_WIDTH / 2, 340);
  ctx.fillStyle = "#E0F2FE";
  ctx.font = '600 25px "IBM Plex Sans Arabic", Arial, sans-serif';
  ctx.fillText("أربعة أوسمة تلخّص حكاية المجلس طوال البطولة", CARD_WIDTH / 2, 395);

  HARVEST_AWARDS.forEach((definition, index) => {
    const award = awards.find((item) => item.key === definition.key);
    const y = 455 + index * 175;
    ctx.fillStyle = "rgba(255,255,255,0.12)";
    ctx.beginPath();
    ctx.roundRect(70, y, 940, 145, 30);
    ctx.fill();
    ctx.strokeStyle = "rgba(255,255,255,0.16)";
    ctx.lineWidth = 2;
    ctx.stroke();

    ctx.textAlign = "center";
    ctx.font = '52px "Apple Color Emoji", "Segoe UI Emoji", sans-serif';
    ctx.fillText(definition.emoji, 930, y + 91);

    ctx.textAlign = "right";
    ctx.fillStyle = "sky-300";
    ctx.font = '800 24px "IBM Plex Sans Arabic", Arial, sans-serif';
    ctx.fillText(definition.title, 845, y + 43);
    ctx.fillStyle = "#FFFFFF";
    const winner = award?.name || "لم يُحسم";
    setFittedFont(ctx, winner, 545, 39, 900);
    ctx.fillText(winner, 845, y + 92);
    ctx.fillStyle = "#E0F2FE";
    ctx.font = '600 20px "IBM Plex Sans Arabic", Arial, sans-serif';
    const detail = [award?.description, award?.value != null ? String(award.value) : null].filter(Boolean).join(" · ") || "لا تتوفر بيانات كافية";
    ctx.fillText(detail.length > 64 ? `${detail.slice(0, 63)}…` : detail, 845, y + 124);
  });

  ctx.textAlign = "center";
  ctx.fillStyle = "#FFFFFF";
  ctx.font = '800 34px "IBM Plex Sans Arabic", Arial, sans-serif';
  ctx.fillText("المنافسة انتهت… والسوالف تبقى", CARD_WIDTH / 2, 1195);
  ctx.fillStyle = "sky-300";
  ctx.font = '700 25px "IBM Plex Sans Arabic", Arial, sans-serif';
  ctx.fillText("sabq.org/gulf-cup/majlis", CARD_WIDTH / 2, 1242);
  ctx.fillStyle = "rgba(255,255,255,0.72)";
  ctx.font = '600 20px "IBM Plex Sans Arabic", Arial, sans-serif';
  ctx.fillText("سبق · منصة إخبارية سعودية ذكية", CARD_WIDTH / 2, 1302);

  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("تعذّر إنشاء بطاقة الحصاد"))), "image/png");
  });
}

export function GcMajlisShareDialog({ majlis }: { majlis: GcMajlisSummary }) {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [blob, setBlob] = useState<Blob | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!open) return;
    let active = true;
    setLoading(true);
    renderCard(majlis)
      .then((nextBlob) => {
        if (!active) return;
        const nextPreview = URL.createObjectURL(nextBlob);
        setBlob(nextBlob);
        setPreview((previous) => {
          if (previous) URL.revokeObjectURL(previous);
          return nextPreview;
        });
      })
      .catch((error: Error) => {
        if (active) toast({ title: "تعذّر إنشاء البطاقة", description: error.message, variant: "destructive" });
      })
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, [open, majlis, toast]);

  useEffect(
    () => () => {
      if (preview) URL.revokeObjectURL(preview);
    },
    [preview],
  );

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(inviteUrl(majlis.code));
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
      toast({ title: "نُسخ رابط الدعوة" });
    } catch {
      toast({ title: "رابط الدعوة", description: inviteUrl(majlis.code) });
    }
  };

  const share = async () => {
    const url = inviteUrl(majlis.code);
    const file = blob ? new File([blob], `majlis-${majlis.code}.png`, { type: "image/png" }) : null;
    try {
      if (navigator.share) {
        const payload: ShareData = {
          title: `مجلس ${majlis.name}`,
          text: `انضم إلى مجلس «${majlis.name}» ونافسنا في توقعات خليجي 27`,
          url,
        };
        if (file && navigator.canShare?.({ files: [file] })) payload.files = [file];
        await navigator.share(payload);
        return;
      }
      await copyLink();
    } catch (error) {
      if ((error as DOMException)?.name !== "AbortError") await copyLink();
    }
  };

  const download = () => {
    if (!blob) return;
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `majlis-${majlis.code}.png`;
    anchor.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button className="gap-2 rounded-full bg-sky-500 text-white hover:bg-sky-400">
          <Share2 className="h-4 w-4" aria-hidden="true" />
          ادعُ مجلسك
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl text-right" dir="rtl">
        <DialogHeader>
          <DialogTitle>بطاقة دعوة «{majlis.name}»</DialogTitle>
          <DialogDescription>شارك البطاقة في واتساب، أو أرسل الرابط مباشرةً لمن تريد.</DialogDescription>
        </DialogHeader>

        <div className="overflow-hidden rounded-2xl border border-border bg-muted/50">
          {loading ? (
            <div className="grid aspect-[4/5] max-h-[62vh] place-items-center" role="status">
              <Loader2 className="h-7 w-7 animate-spin text-sky-600 motion-reduce:animate-none" />
              <span className="sr-only">جارٍ إنشاء بطاقة الدعوة</span>
            </div>
          ) : preview ? (
            <img src={preview} alt={`بطاقة دعوة إلى مجلس ${majlis.name}`} className="mx-auto aspect-[4/5] max-h-[62vh] w-auto object-contain" />
          ) : (
            <div className="grid aspect-[4/5] max-h-[62vh] place-items-center text-sm text-muted-foreground">تعذّرت المعاينة</div>
          )}
        </div>

        <div className="flex flex-wrap gap-2">
          <Button onClick={share} className="gap-2 bg-sky-600 text-white hover:bg-sky-800">
            <Share2 className="h-4 w-4" aria-hidden="true" /> مشاركة
          </Button>
          <Button variant="outline" onClick={download} disabled={!blob} className="gap-2">
            <Download className="h-4 w-4" aria-hidden="true" /> حفظ الصورة
          </Button>
          <Button variant="outline" onClick={copyLink} className="gap-2">
            {copied ? <Check className="h-4 w-4 text-emerald-600" /> : <Copy className="h-4 w-4" />}
            نسخ الرابط
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function GcMajlisHarvestShareDialog({
  majlisId,
  majlisName,
  awards,
}: {
  majlisId: string;
  majlisName: string;
  awards: GcMajlisHarvestAward[];
}) {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [blob, setBlob] = useState<Blob | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const url = `${typeof window === "undefined" ? "https://sabq.org" : window.location.origin}/gulf-cup/majlis/${encodeURIComponent(majlisId)}?view=harvest`;

  useEffect(() => {
    if (!open) return;
    let active = true;
    setLoading(true);
    renderHarvestCard(majlisName, awards)
      .then((nextBlob) => {
        if (!active) return;
        const nextPreview = URL.createObjectURL(nextBlob);
        setBlob(nextBlob);
        setPreview((previous) => {
          if (previous) URL.revokeObjectURL(previous);
          return nextPreview;
        });
      })
      .catch((error: Error) => {
        if (active) toast({ title: "تعذّر إنشاء بطاقة الحصاد", description: error.message, variant: "destructive" });
      })
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, [open, majlisName, awards, toast]);

  useEffect(
    () => () => {
      if (preview) URL.revokeObjectURL(preview);
    },
    [preview],
  );

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(url);
      toast({ title: "نُسخ رابط الحصاد" });
    } catch {
      toast({ title: "رابط حصاد المجلس", description: url });
    }
  };

  const share = async () => {
    const file = blob ? new File([blob], `majlis-harvest-${majlisId}.png`, { type: "image/png" }) : null;
    try {
      if (navigator.share) {
        const payload: ShareData = {
          title: `حصاد مجلس ${majlisName}`,
          text: `شاهد حصاد وأوسمة مجلس «${majlisName}» في توقعات خليجي 27`,
          url,
        };
        if (file && navigator.canShare?.({ files: [file] })) payload.files = [file];
        await navigator.share(payload);
        return;
      }
      await copyLink();
    } catch (error) {
      if ((error as DOMException)?.name !== "AbortError") await copyLink();
    }
  };

  const download = () => {
    if (!blob) return;
    const objectUrl = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = objectUrl;
    anchor.download = `majlis-harvest-${majlisId}.png`;
    anchor.click();
    window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button className="gap-2 bg-white text-sky-800 hover:bg-emerald-50">
          <Share2 className="h-4 w-4" aria-hidden="true" /> مشاركة الحصاد
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-xl text-right" dir="rtl">
        <DialogHeader>
          <DialogTitle>بطاقة حصاد «{majlisName}»</DialogTitle>
          <DialogDescription>صورة عمودية جاهزة لواتساب تجمع أوسمة المجلس الأربعة.</DialogDescription>
        </DialogHeader>
        <div className="overflow-hidden rounded-2xl border border-border bg-muted/50">
          {loading ? (
            <div className="grid aspect-[4/5] max-h-[58vh] place-items-center" role="status">
              <Loader2 className="h-7 w-7 animate-spin text-sky-600 motion-reduce:animate-none" />
              <span className="sr-only">جارٍ إنشاء بطاقة الحصاد</span>
            </div>
          ) : preview ? (
            <img src={preview} alt={`بطاقة حصاد مجلس ${majlisName}`} className="mx-auto aspect-[4/5] max-h-[58vh] w-auto object-contain" />
          ) : (
            <div className="grid aspect-[4/5] max-h-[58vh] place-items-center text-sm text-muted-foreground">تعذّرت المعاينة</div>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          <Button onClick={share} disabled={!blob} className="gap-2 bg-sky-600 text-white hover:bg-sky-800"><Share2 className="h-4 w-4" /> مشاركة</Button>
          <Button variant="outline" onClick={download} disabled={!blob} className="gap-2"><Download className="h-4 w-4" /> حفظ الصورة</Button>
          <Button variant="outline" onClick={copyLink} className="gap-2"><Copy className="h-4 w-4" /> نسخ الرابط</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
