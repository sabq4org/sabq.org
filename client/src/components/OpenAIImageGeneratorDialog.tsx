import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { ImagePlus, Loader2, RefreshCw } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { apiRequest } from "@/lib/queryClient";
import { EDITORIAL_IMAGE_MODELS, type EditorialImageJob, type EditorialImageRequest } from "@shared/editorialImages";

interface Props {
  userId: string;
  open: boolean;
  onClose: () => void;
  onImageGenerated: (url: string) => void;
  articleTitle: string;
  articleExcerpt: string;
}

export function OpenAIImageGeneratorDialog({ userId, open, onClose, onImageGenerated, articleTitle, articleExcerpt }: Props) {
  const [prompt, setPrompt] = useState("");
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
      <DialogContent dir="rtl" className="max-h-[90dvh] overflow-y-auto sm:max-w-3xl [&>button]:left-4 [&>button]:right-auto" data-testid="openai-image-dialog">
        <DialogHeader className="text-right sm:text-right">
          <DialogTitle className="flex items-center gap-2"><ImagePlus className="h-5 w-5 text-sky-600" />صور GPT</DialogTitle>
          <DialogDescription>صمّم صورة للخبر، راجع النتيجة، ثم اختر استخدامها صورةً بارزة.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-6 md:grid-cols-2">
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="gpt-image-prompt">وصف الصورة</Label>
              <Textarea id="gpt-image-prompt" value={prompt} onChange={(event) => setPrompt(event.target.value)} maxLength={4000} disabled={working} rows={7} placeholder="اكتب المشهد المطلوب والأسلوب وأي نص تريد ظهوره…" className="resize-y leading-7" />
              <p className="text-xs text-muted-foreground">راجع النصوص والأرقام في الصورة قبل استخدامها.</p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="gpt-image-model">النموذج</Label>
              <Select value={model} onValueChange={(value) => setModel(value as EditorialImageRequest["model"])} disabled={working}>
                <SelectTrigger id="gpt-image-model"><SelectValue /></SelectTrigger>
                <SelectContent>{EDITORIAL_IMAGE_MODELS.map((item) => <SelectItem value={item.id} key={item.id}>{item.label}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="gpt-image-size">المقاس</Label>
                <Select value={size} onValueChange={(value) => setSize(value as EditorialImageRequest["size"])} disabled={working}>
                  <SelectTrigger id="gpt-image-size"><SelectValue /></SelectTrigger>
                  <SelectContent><SelectItem value="1536x864">عريض 16:9</SelectItem><SelectItem value="1024x1024">مربع 1:1</SelectItem><SelectItem value="1024x1536">رأسي 2:3</SelectItem></SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="gpt-image-quality">الجودة</Label>
                <Select value={quality} onValueChange={(value) => setQuality(value as EditorialImageRequest["quality"])} disabled={working}>
                  <SelectTrigger id="gpt-image-quality"><SelectValue /></SelectTrigger>
                  <SelectContent><SelectItem value="low">مسودة سريعة</SelectItem><SelectItem value="medium">متوازنة</SelectItem><SelectItem value="high">عالية</SelectItem></SelectContent>
                </Select>
              </div>
            </div>
            {capabilities.isPending && <p role="status" className="text-sm text-muted-foreground">جارٍ التحقق من إتاحة خدمة الصور…</p>}
            {capabilities.isError && <div role="alert" className="text-sm text-destructive">تعذر التحقق من خدمة الصور. <Button variant="ghost" size="sm" onClick={() => void capabilities.refetch()}>إعادة المحاولة</Button></div>}
            {!capabilities.isPending && !capabilities.isError && !capabilities.data?.configured && <p role="alert" className="text-sm text-muted-foreground">خدمة صور GPT غير مفعّلة. راجع مسؤول النظام لإعداد مفتاح الصور المخصص.</p>}
            {generation.isError && <p role="alert" className="text-sm text-destructive">{generation.error.message}</p>}
            <Button type="button" onClick={generate} disabled={working || !capabilities.data?.configured || capabilities.isError || prompt.trim().length < 10} className="w-full gap-2 bg-sky-700 text-white hover:bg-sky-800" data-testid="button-run-openai-image">
              {working ? <Loader2 className="h-4 w-4 animate-spin" /> : <ImagePlus className="h-4 w-4" />}
              {working ? "جارٍ التوليد…" : "توليد صورة GPT"}
            </Button>
          </div>
          <div className="flex min-h-64 flex-col justify-center rounded-xl border bg-muted/20 p-4">
            {working ? <div role="status" className="space-y-3 text-center"><Loader2 className="mx-auto h-7 w-7 animate-spin text-sky-600" /><p className="text-sm">جارٍ إعداد الصورة</p><p className="text-xs leading-6 text-muted-foreground">يمكنك إغلاق النافذة ومواصلة التحرير، ثم العودة لمراجعة النتيجة.</p></div>
              : ready ? <figure className="space-y-3"><img key={current!.imageUrl} src={current!.imageUrl!} alt="معاينة صورة توضيحية مولدة بالذكاء الاصطناعي" className="max-h-96 w-full rounded-lg object-contain" onLoad={() => { setImageLoaded(true); setImageError(false); }} onError={() => { setImageLoaded(false); setImageError(true); }} /><figcaption className="text-center text-xs leading-6 text-muted-foreground">صورة مولّدة بالذكاء الاصطناعي<br />{current!.model}</figcaption></figure>
              : current?.status === "failed" ? <p role="alert" className="text-center text-sm leading-7 text-destructive">{current.error || "تعذر توليد الصورة."}</p>
              : <div className="space-y-3 text-center text-muted-foreground"><ImagePlus className="mx-auto h-10 w-10 opacity-50" /><p className="text-sm">ستظهر معاينة الصورة هنا</p></div>}
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
