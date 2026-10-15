import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import {
  Camera,
  Check,
  ImagePlus,
  Landmark,
  Loader2,
  Palette,
  RefreshCw,
  Sparkles,
  TrendingUp,
  Zap,
} from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { apiRequest } from "@/lib/queryClient";
import { cn } from "@/lib/utils";
import { EDITORIAL_IMAGE_MODELS, type EditorialImageJob, type EditorialImageRequest } from "@shared/editorialImages";

interface Props {
  userId: string;
  open: boolean;
  onClose: () => void;
  onImageGenerated: (url: string) => void;
  articleTitle: string;
  articleExcerpt: string;
}

const GPT_SCENE_PRESETS = [
  {
    id: "photo",
    label: "صحفي واقعي",
    hint: "لقطة إخبارية طبيعية",
    icon: Camera,
    activeClass:
      "border-sky-500 bg-sky-500/15 text-sky-950 ring-2 ring-sky-500/25 dark:bg-sky-500/20 dark:text-sky-100",
    idleClass:
      "border-sky-200/80 bg-sky-50/60 text-sky-900 hover:border-sky-400 hover:bg-sky-100/70 dark:border-sky-900/60 dark:bg-sky-950/30 dark:text-sky-200",
    iconBoxClass: "bg-sky-500 text-white",
    build: (base: string) =>
      `${base}\nأسلوب تصوير صحفي واقعي احترافي عالي الدقة، إضاءة طبيعية متوازنة، بدون أي نصوص أو حروف أو شعارات مكتوبة داخل الصورة.`,
  },
  {
    id: "symbolic",
    label: "تعبيري رمزي",
    hint: "للرأي والتحليلات",
    icon: Palette,
    activeClass:
      "border-violet-500 bg-violet-500/15 text-violet-950 ring-2 ring-violet-500/25 dark:bg-violet-500/20 dark:text-violet-100",
    idleClass:
      "border-violet-200/80 bg-violet-50/60 text-violet-900 hover:border-violet-400 hover:bg-violet-100/70 dark:border-violet-900/60 dark:bg-violet-950/30 dark:text-violet-200",
    iconBoxClass: "bg-violet-500 text-white",
    build: (base: string) =>
      `${base}\nتكوين فني تعبيري رمزي هادئ وعميق يناسب المقالات والتحليلات الصحفية، ألوان متناسقة، بدون أي نصوص أو حروف داخل الصورة.`,
  },
  {
    id: "economy",
    label: "اقتصادي / تقني",
    hint: "أعمال وأسواق وتقنية",
    icon: TrendingUp,
    activeClass:
      "border-emerald-500 bg-emerald-500/15 text-emerald-950 ring-2 ring-emerald-500/25 dark:bg-emerald-500/20 dark:text-emerald-100",
    idleClass:
      "border-emerald-200/80 bg-emerald-50/60 text-emerald-900 hover:border-emerald-400 hover:bg-emerald-100/70 dark:border-emerald-900/60 dark:bg-emerald-950/30 dark:text-emerald-200",
    iconBoxClass: "bg-emerald-500 text-white",
    build: (base: string) =>
      `${base}\nمشهد بصري عصري يعكس قطاع الأعمال والاقتصاد والتقنية الحديثة في المملكة العربية السعودية، إضاءة احترافية، بدون نصوص أو شعارات.`,
  },
  {
    id: "saudi",
    label: "هوية ومعالم",
    hint: "طابع عمراني سعودي",
    icon: Landmark,
    activeClass:
      "border-amber-500 bg-amber-500/15 text-amber-950 ring-2 ring-amber-500/25 dark:bg-amber-500/20 dark:text-amber-100",
    idleClass:
      "border-amber-200/80 bg-amber-50/60 text-amber-900 hover:border-amber-400 hover:bg-amber-100/70 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-200",
    iconBoxClass: "bg-amber-500 text-white",
    build: (base: string) =>
      `${base}\nمشهد حضري ومعماري حديث يعكس الهوية السعودية المعاصرة ومعالم المملكة بجودة سينمائية، بدون نصوص أو شعارات.`,
  },
] as const;

export function OpenAIImageGeneratorDialog({ userId, open, onClose, onImageGenerated, articleTitle, articleExcerpt }: Props) {
  const [prompt, setPrompt] = useState("");
  const [activePreset, setActivePreset] = useState<string | null>(null);
  const [model, setModel] = useState<EditorialImageRequest["model"]>("gpt-image-2.5-flare");
  const [size, setSize] = useState<EditorialImageRequest["size"]>("1536x864");
  const [quality, setQuality] = useState<EditorialImageRequest["quality"]>("medium");
  const [job, setJob] = useState<EditorialImageJob | null>(null);
  const [imageLoaded, setImageLoaded] = useState(false);
  const [imageError, setImageError] = useState(false);
  const wasOpen = useRef(false);
  const storageKey = `sabq:gpt-image-job:${userId}`;
  const requestRef = useRef<{ signature: string; requestId: string } | null>(null);

  useEffect(() => {
    setJob(null);
    requestRef.current = null;
    try {
      const id = sessionStorage.getItem(storageKey);
      if (id && /^[0-9a-f-]{36}$/i.test(id)) setJob({ id, status: "processing", model: "", imageUrl: null, error: null });
    } catch { /* Session storage is optional in restricted browsers. */ }
  }, [storageKey]);

  useEffect(() => {
    if (open && !wasOpen.current && !prompt && articleTitle) {
      setPrompt(`صورة توضيحية للخبر: ${articleTitle}${articleExcerpt ? `\n${articleExcerpt}` : ""}`.slice(0, 4000));
    }
    wasOpen.current = open;
  }, [open, articleTitle, articleExcerpt, prompt]);

  const capabilities = useQuery<{ configured: boolean }>({
    queryKey: ["/api/editorial-images/capabilities"],
    queryFn: () => apiRequest("/api/editorial-images/capabilities"),
    enabled: open,
    staleTime: 0,
    retry: false,
  });
  const status = useQuery<EditorialImageJob>({
    queryKey: ["/api/editorial-images/generations", job?.id],
    queryFn: () => apiRequest(`/api/editorial-images/generations/${job!.id}`),
    enabled: Boolean(job?.id),
    refetchInterval: (query) => query.state.error || (query.state.data && query.state.data.status !== "processing") ? false : 2000,
    retry: false,
  });
  // Only the endpoint's explicit not-found response permits discarding a job.
  // Network/503 errors must preserve its ID so a paid result can be recovered.
  const jobMissing = status.isError && status.error.message === "عملية التوليد غير موجودة.";
  const current = status.data ?? job;
  const generation = useMutation({
    mutationFn: (input: EditorialImageRequest): Promise<EditorialImageJob> => apiRequest("/api/editorial-images/generations", { method: "POST", body: JSON.stringify(input) }),
    retry: false,
    onSuccess: (result) => {
      setImageLoaded(false);
      setImageError(false);
      setJob(result);
      requestRef.current = null;
    },
  });
  const working = generation.isPending || current?.status === "processing";
  const ready = current?.status === "completed" && Boolean(current.imageUrl);

  function generate() {
    const signature = JSON.stringify({ prompt: prompt.trim(), model, size, quality });
    // Retrying a lost POST response reuses its ID, so it cannot bill twice.
    if (requestRef.current?.signature !== signature) requestRef.current = { signature, requestId: crypto.randomUUID() };
    try { sessionStorage.setItem(storageKey, requestRef.current.requestId); } catch { /* Optional recovery. */ }
    generation.mutate({ requestId: requestRef.current.requestId, prompt: prompt.trim(), model, size, quality });
  }

  return (
    <Dialog open={open} onOpenChange={(value) => { if (!value) onClose(); }}>
      <DialogContent dir="rtl" className="max-h-[90dvh] overflow-y-auto sm:max-w-3xl p-4 sm:p-6 [&>button]:left-4 [&>button]:right-auto" data-testid="openai-image-dialog">
        <DialogHeader className="text-right sm:text-right rounded-xl border border-sky-500/20 bg-gradient-to-l from-sky-500/10 via-indigo-500/5 to-transparent p-3.5">
          <DialogTitle className="flex items-center gap-2.5 text-base sm:text-lg">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-sky-600 text-white shadow-sm">
              <ImagePlus className="h-4 w-4" />
            </span>
            <span>استوديو صور GPT</span>
            <span className="mr-auto rounded-full border border-sky-500/30 bg-sky-500/10 px-2.5 py-0.5 text-[11px] font-semibold text-sky-700 dark:text-sky-300">
              OpenAI 2.5
            </span>
          </DialogTitle>
          <DialogDescription className="text-xs sm:text-sm mt-1">
            اختر نمط المشهد أو اكتب وصفك، وحدد المقاس والجودة لتوليد صورة بارزة للخبر.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-5 md:grid-cols-2">
          <div className="space-y-4">
            {/* 1. بطاقات الأنماط السريعة الملوّنة */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-xs font-bold text-foreground">
                  1. اختر أسلوب المشهد (يجهز الوصف تلقائياً)
                </Label>
                <span className="text-[11px] text-muted-foreground">اضغط للاختيار</span>
              </div>
              <div className="grid grid-cols-2 gap-2" data-testid="gpt-image-presets">
                {GPT_SCENE_PRESETS.map((preset) => {
                  const Icon = preset.icon;
                  const isSelected = activePreset === preset.id;
                  return (
                    <button
                      key={preset.id}
                      type="button"
                      disabled={working}
                      onClick={() => {
                        setActivePreset(preset.id);
                        const seed = articleTitle.trim()
                          ? `صورة توضيحية للخبر: ${articleTitle.trim()}${articleExcerpt ? `\n${articleExcerpt.trim()}` : ""}`
                          : "مشهد إخباري صحفي احترافي";
                        setPrompt(preset.build(seed).slice(0, 4000));
                      }}
                      className={cn(
                        "no-min-touch-size relative flex items-center gap-2.5 rounded-xl border-2 p-2.5 text-right transition-all disabled:opacity-50",
                        isSelected ? preset.activeClass : preset.idleClass,
                      )}
                    >
                      <span
                        className={cn(
                          "flex h-8 w-8 shrink-0 items-center justify-center rounded-lg shadow-sm",
                          preset.iconBoxClass,
                        )}
                      >
                        <Icon className="h-4 w-4" />
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="text-xs font-bold truncate">{preset.label}</div>
                        <div className="text-[10px] opacity-80 truncate">{preset.hint}</div>
                      </div>
                      <span
                        className={cn(
                          "flex h-4 w-4 shrink-0 items-center justify-center rounded-full border",
                          isSelected
                            ? "border-current bg-current text-white dark:text-slate-950"
                            : "border-current/40 bg-white/50 dark:bg-slate-900/50",
                        )}
                      >
                        {isSelected && <Check className="h-2.5 w-2.5 stroke-[3]" />}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* 2. حقل وصف الصورة */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <Label htmlFor="gpt-image-prompt" className="text-xs font-bold text-foreground">
                  2. وصف الصورة المطلوبة
                </Label>
                <span className="text-[11px] tabular-nums text-muted-foreground">
                  {prompt.length}/4000
                </span>
              </div>
              <Textarea
                id="gpt-image-prompt"
                value={prompt}
                onChange={(event) => setPrompt(event.target.value)}
                maxLength={4000}
                disabled={working}
                rows={4}
                placeholder="اضغط على أحد الأساليب أعلاه لتعبئة الوصف تلقائياً، أو اكتب المشهد المطلوب هنا…"
                className="resize-y leading-7 border-2 border-slate-200 bg-slate-50/70 focus-visible:border-sky-500 focus-visible:bg-background dark:border-slate-800 dark:bg-slate-900/50"
              />
              <p className="text-[11px] text-muted-foreground">
                راجع النصوص والأرقام في الصورة قبل استخدامها.
              </p>
            </div>

            {/* 3. اختيار النموذج — بطاقات تفاعلية واضحة بدلاً من قائمة صماء */}
            <div className="space-y-1.5">
              <Label id="gpt-image-model" className="text-xs font-bold text-foreground">
                3. محرك التوليد (النموذج)
              </Label>
              <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-labelledby="gpt-image-model">
                {EDITORIAL_IMAGE_MODELS.map((item) => {
                  const isSelected = model === item.id;
                  const isFlare = item.id.includes("flare");
                  return (
                    <button
                      key={item.id}
                      type="button"
                      disabled={working}
                      onClick={() => setModel(item.id)}
                      className={cn(
                        "no-min-touch-size flex items-center gap-2 rounded-xl border-2 p-2.5 text-right transition-all disabled:opacity-50",
                        isSelected
                          ? "border-sky-600 bg-sky-500/10 text-sky-950 shadow-sm ring-2 ring-sky-500/20 dark:border-sky-400 dark:bg-sky-500/20 dark:text-sky-50"
                          : "border-slate-200 bg-slate-50/80 text-slate-700 hover:border-slate-300 hover:bg-slate-100 dark:border-slate-800 dark:bg-slate-900/60 dark:text-slate-300",
                      )}
                    >
                      <span
                        className={cn(
                          "flex h-7 w-7 shrink-0 items-center justify-center rounded-lg",
                          isSelected
                            ? "bg-sky-600 text-white"
                            : "bg-slate-200 text-slate-600 dark:bg-slate-800 dark:text-slate-400",
                        )}
                      >
                        {isFlare ? <Zap className="h-3.5 w-3.5" /> : <Sparkles className="h-3.5 w-3.5" />}
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="text-xs font-bold truncate">
                          {isFlare ? "Flare 2.5" : "Sunburst 2.5"}
                        </div>
                        <div className="text-[10px] text-muted-foreground truncate">
                          {isFlare ? "سريع ومتوازن" : "تفاصيل فائقة"}
                        </div>
                      </div>
                      {isSelected && <Check className="h-4 w-4 shrink-0 text-sky-600 dark:text-sky-400" />}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* 4. المقاس والجودة — أزرار مرئية ملوّنة واضحة */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label id="gpt-image-size" className="text-xs font-bold text-foreground">
                  4. المقاس
                </Label>
                <div className="grid grid-cols-3 gap-1.5 rounded-xl border border-slate-200 bg-slate-100/80 p-1 dark:border-slate-800 dark:bg-slate-900">
                  {[
                    { value: "1536x864" as const, label: "عريض", ratio: "16:9", box: "w-5 h-3" },
                    { value: "1024x1024" as const, label: "مربع", ratio: "1:1", box: "w-3.5 h-3.5" },
                    { value: "1024x1536" as const, label: "رأسي", ratio: "2:3", box: "w-3 h-4.5" },
                  ].map((opt) => {
                    const isSelected = size === opt.value;
                    return (
                      <button
                        key={opt.value}
                        type="button"
                        disabled={working}
                        onClick={() => setSize(opt.value)}
                        className={cn(
                          "no-min-touch-size flex flex-col items-center justify-center gap-0.5 rounded-lg py-1.5 px-1 text-center transition-all disabled:opacity-50",
                          isSelected
                            ? "bg-sky-600 text-white shadow-sm font-bold"
                            : "text-slate-600 hover:bg-white/70 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800",
                        )}
                      >
                        <span className="text-[11px] leading-tight">{opt.label}</span>
                        <span className={cn("text-[10px] tabular-nums", isSelected ? "text-sky-100" : "opacity-75")}>
                          {opt.ratio}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="space-y-1.5">
                <Label id="gpt-image-quality" className="text-xs font-bold text-foreground">
                  5. الجودة
                </Label>
                <div className="grid grid-cols-3 gap-1.5 rounded-xl border border-slate-200 bg-slate-100/80 p-1 dark:border-slate-800 dark:bg-slate-900">
                  {[
                    { value: "low" as const, label: "سريعة", sub: "مسودة" },
                    { value: "medium" as const, label: "متوازنة", sub: "موصى بها" },
                    { value: "high" as const, label: "عالية", sub: "فائقة" },
                  ].map((opt) => {
                    const isSelected = quality === opt.value;
                    return (
                      <button
                        key={opt.value}
                        type="button"
                        disabled={working}
                        onClick={() => setQuality(opt.value)}
                        className={cn(
                          "no-min-touch-size flex flex-col items-center justify-center gap-0.5 rounded-lg py-1.5 px-1 text-center transition-all disabled:opacity-50",
                          isSelected
                            ? "bg-indigo-600 text-white shadow-sm font-bold"
                            : "text-slate-600 hover:bg-white/70 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800",
                        )}
                      >
                        <span className="text-[11px] leading-tight">{opt.label}</span>
                        <span className={cn("text-[10px]", isSelected ? "text-indigo-100" : "opacity-75")}>
                          {opt.sub}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>

            {capabilities.isPending && <p role="status" className="text-sm text-muted-foreground">جارٍ التحقق من إتاحة خدمة الصور…</p>}
            {capabilities.isError && <div role="alert" className="text-sm text-destructive">تعذر التحقق من خدمة الصور. <Button variant="ghost" size="sm" onClick={() => void capabilities.refetch()}>إعادة المحاولة</Button></div>}
            {!capabilities.isPending && !capabilities.isError && !capabilities.data?.configured && <p role="alert" className="text-sm text-muted-foreground">خدمة صور GPT غير مفعّلة. راجع مسؤول النظام لإعداد مفتاح الصور المخصص.</p>}
            {generation.isError && <p role="alert" className="text-sm text-destructive">{generation.error.message}</p>}
            <Button
              type="button"
              onClick={generate}
              disabled={working || !capabilities.data?.configured || capabilities.isError || prompt.trim().length < 10}
              className="w-full h-11 gap-2 bg-gradient-to-l from-sky-600 to-indigo-600 text-white font-bold shadow-md hover:from-sky-700 hover:to-indigo-700 disabled:opacity-50"
              data-testid="button-run-openai-image"
            >
              {working ? <Loader2 className="h-4 w-4 animate-spin" /> : <ImagePlus className="h-4 w-4" />}
              {working ? "جارٍ التوليد…" : "توليد صورة GPT"}
            </Button>
          </div>
          <div className="flex min-h-64 flex-col justify-center rounded-xl border-2 border-dashed border-slate-200 bg-slate-50/50 p-4 dark:border-slate-800 dark:bg-slate-900/40">
            {working ? <div role="status" className="space-y-3 text-center"><Loader2 className="mx-auto h-7 w-7 animate-spin text-sky-600" /><p className="text-sm font-medium">جارٍ إعداد الصورة</p><p className="text-xs leading-6 text-muted-foreground">يمكنك إغلاق النافذة ومواصلة التحرير، ثم العودة لمراجعة النتيجة.</p></div>
              : ready ? <figure className="space-y-3"><img key={current!.imageUrl} src={current!.imageUrl!} alt="معاينة صورة توضيحية مولدة بالذكاء الاصطناعي" className="max-h-96 w-full rounded-lg object-contain" onLoad={() => { setImageLoaded(true); setImageError(false); }} onError={() => { setImageLoaded(false); setImageError(true); }} /><figcaption className="text-center text-xs leading-6 text-muted-foreground">صورة مولّدة بالذكاء الاصطناعي<br />{current!.model}</figcaption></figure>
              : current?.status === "failed" ? <p role="alert" className="text-center text-sm leading-7 text-destructive">{current.error || "تعذر توليد الصورة."}</p>
              : <div className="space-y-3 text-center text-muted-foreground"><div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-sky-500/10 text-sky-600 dark:text-sky-400"><ImagePlus className="h-6 w-6" /></div><p className="text-sm font-medium text-foreground">معاينة الصورة المولّدة</p><p className="text-xs text-muted-foreground">اختر أسلوب المشهد واضغط «توليد صورة GPT» لتظهر النتيجة هنا</p></div>}
            {imageError && <p role="alert" className="mt-3 text-sm text-destructive">تعذر تحميل المعاينة. تحقق من الاتصال قبل استخدام الصورة.</p>}
            {status.isError && <div role="alert" className="mt-4 space-y-2 text-center"><p className="text-sm text-destructive">تعذر تحديث حالة الصورة. التوليد قد يكون مستمرًا.</p><Button variant="outline" size="sm" onClick={() => void status.refetch()} className="gap-2"><RefreshCw className="h-4 w-4" />تحديث الحالة</Button>{jobMissing && <Button variant="ghost" size="sm" onClick={() => { setJob(null); requestRef.current = null; try { sessionStorage.removeItem(storageKey); } catch { /* Optional recovery. */ } }}>بدء محاولة جديدة</Button>}</div>}
          </div>
        </div>
        <DialogFooter className="gap-2 sm:justify-start">
          <Button type="button" disabled={!ready || !imageLoaded || working || generation.isPending} onClick={() => { if (current?.imageUrl) { onImageGenerated(current.imageUrl); onClose(); } }} data-testid="button-use-openai-image">استخدام الصورة</Button>
          <Button type="button" variant="outline" onClick={onClose}>إغلاق</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
