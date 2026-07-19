import { useEffect, useState } from "react";
import { CheckCircle2, ChevronLeft, Trophy, Users, WandSparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

const ONBOARDING_VERSION = 1;

const slides = [
  {
    icon: Trophy,
    title: "ترتيبك بين ناسك",
    description: "هنا منافستك الحقيقية: ترتيب صغير وواضح يجمع أهل مجلسك فقط، ويتحدث مع كل مباراة.",
  },
  {
    icon: WandSparkles,
    title: "السر يبقى حتى الصافرة",
    description: "قبل إقفال المباراة نريك من توقّع فقط. بعد الإقفال تنكشف النتائج ويبدأ النقاش.",
  },
  {
    icon: Users,
    title: "المجلس يحلى بأهله",
    description: "ادعُ حتى 50 عضوًا عبر رابط أو بطاقة جاهزة، ثم عُدوا كل يوم لمعرفة بطل الجولة.",
  },
] as const;

function storageKey(userId: string, majlisId: string) {
  return `gc-majlis-onboarding:v${ONBOARDING_VERSION}:${userId}:${majlisId}`;
}

function wasSeen(userId: string, majlisId: string): boolean {
  try {
    return localStorage.getItem(storageKey(userId, majlisId)) === "done";
  } catch {
    return false;
  }
}

function markSeen(userId: string, majlisId: string): void {
  try {
    localStorage.setItem(storageKey(userId, majlisId), "done");
  } catch {
    // التخزين تحسين فقط؛ فشل Safari الخاص لا يمنع دخول المجلس.
  }
}

export function GcMajlisOnboarding({
  userId,
  majlisId,
  majlisName,
  onSkip,
  onPredictNow,
}: {
  userId: string;
  majlisId: string;
  majlisName: string;
  onSkip: () => void;
  onPredictNow: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState(0);

  useEffect(() => {
    setStep(0);
    setOpen(!wasSeen(userId, majlisId));
  }, [userId, majlisId]);

  const finish = (predictNow: boolean) => {
    markSeen(userId, majlisId);
    setOpen(false);
    if (predictNow) onPredictNow();
    else onSkip();
  };

  const handleOpenChange = (next: boolean) => {
    if (next) setOpen(true);
    else finish(false);
  };

  const slide = slides[step];
  const Icon = slide.icon;

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-lg overflow-hidden border-emerald-700/20 p-0 text-right" dir="rtl">
        <div className="bg-gradient-to-bl from-sky-500 via-sky-600 to-[#075339] px-6 py-7 text-white">
          <p className="text-xs font-bold text-emerald-100">أهلًا بك في</p>
          <p className="mt-1 truncate text-xl font-black">{majlisName}</p>
        </div>
        <div className="px-6 pb-6 pt-2">
          <DialogHeader className="items-center text-center sm:text-center">
            <span className="mb-2 grid h-16 w-16 place-items-center rounded-2xl bg-emerald-600/10 text-sky-600 dark:text-emerald-300">
              <Icon className="h-8 w-8" aria-hidden="true" />
            </span>
            <DialogTitle className="text-xl font-black">{slide.title}</DialogTitle>
            <DialogDescription className="min-h-12 max-w-sm text-sm leading-7">
              {slide.description}
            </DialogDescription>
          </DialogHeader>

          <div className="mt-5 flex justify-center gap-2" aria-label={`الخطوة ${step + 1} من ${slides.length}`}>
            {slides.map((item, index) => (
              <span
                key={item.title}
                className={`h-1.5 rounded-full transition-[width,background-color] motion-reduce:transition-none ${
                  index === step ? "w-7 bg-sky-600" : "w-2 bg-muted"
                }`}
              />
            ))}
          </div>

          <div className="mt-6 flex items-center gap-2">
            <Button variant="ghost" onClick={() => finish(false)} className="text-muted-foreground">
              تخطّي
            </Button>
            <Button
              onClick={() => (step === slides.length - 1 ? finish(true) : setStep((value) => value + 1))}
              className="mr-auto gap-2 bg-sky-600 text-white hover:bg-sky-800"
            >
              {step === slides.length - 1 ? (
                <>
                  <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
                  توقّع مباراة اليوم
                </>
              ) : (
                <>
                  التالي
                  <ChevronLeft className="h-4 w-4" aria-hidden="true" />
                </>
              )}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
