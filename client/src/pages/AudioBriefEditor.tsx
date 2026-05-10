import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useParams, useLocation } from "wouter";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { AudioPlayer } from "@/components/AudioPlayer";
import { useToast } from "@/hooks/use-toast";
import { Loader2 } from "lucide-react";
import { type AudioNewsBrief } from "@shared/schema";
import { DashboardLayout } from "@/components/DashboardLayout";

const formSchema = z.object({
  title: z.string().min(3, "العنوان يجب أن يكون 3 أحرف على الأقل"),
  content: z.string().min(20, "المحتوى يجب أن يكون 20 حرف على الأقل"),
  voiceId: z.string().optional(),
  voiceSettings: z.object({
    stability: z.number().min(0).max(1).optional(),
    similarity_boost: z.number().min(0).max(1).optional(),
    style: z.number().min(0).max(1).optional(),
    use_speaker_boost: z.boolean().optional(),
  }).optional(),
});

const ARABIC_VOICES = [
  { id: "pNInz6obpgDQGcFmaJgB", name: "آدم (رسمي)" },
  { id: "EXAVITQu4vr4xnSDxMaL", name: "بيلا (أنثى)" },
  { id: "ThT5KcBeYPX3keUQqHPh", name: "دوروثي (واضح)" },
];

export default function AudioBriefEditor() {
  const params = useParams<{ id: string }>();
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [showPreview, setShowPreview] = useState(false);
  const [pollingJobId, setPollingJobId] = useState<string | null>(null);
  
  const isEdit = !!params.id;
  
  const { data: brief } = useQuery<AudioNewsBrief>({
    queryKey: ['/api/audio-briefs', params.id],
    enabled: isEdit,
  });
  
  const form = useForm({
    resolver: zodResolver(formSchema),
    defaultValues: {
      title: "",
      content: "",
      voiceId: ARABIC_VOICES[0].id,
      voiceSettings: {
        stability: 0.5,
        similarity_boost: 0.75,
        style: 0,
        use_speaker_boost: true,
      },
    },
  });
  
  useEffect(() => {
    if (brief) {
      form.reset({
        title: brief.title,
        content: brief.content,
        voiceId: brief.voiceId || ARABIC_VOICES[0].id,
        voiceSettings: brief.voiceSettings || {
          stability: 0.5,
          similarity_boost: 0.75,
          style: 0,
          use_speaker_boost: true,
        },
      });
    }
  }, [brief]);
  
  const saveMutation = useMutation({
    mutationFn: (data: any) => {
      if (isEdit) {
        return apiRequest(`/api/audio-briefs/${params.id}`, {
          method: 'PUT',
          body: JSON.stringify(data),
        });
      }
      return apiRequest('/api/audio-briefs', {
        method: 'POST',
        body: JSON.stringify(data),
      });
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['/api/audio-briefs/admin'] });
      toast({ title: isEdit ? '✅ تم التحديث' : '✅ تم الحفظ كمسودة' });
      if (!isEdit) {
        setLocation(`/dashboard/audio-briefs/${data.id}/edit`);
      }
    },
  });
  
  const generateMutation = useMutation({
    mutationFn: (id: string) =>
      apiRequest(`/api/audio-briefs/${id}/generate`, { method: 'POST' }),
    onSuccess: (data) => {
      setPollingJobId(data.jobId);
      toast({ title: '⏳ جاري توليد الصوت...' });
    },
  });
  
  useEffect(() => {
    if (!pollingJobId) return;
    
    const interval = setInterval(async () => {
      try {
        const job = await fetch(`/api/audio-briefs/jobs/${pollingJobId}`).then(r => r.json());
        
        if (job.status === 'completed') {
          clearInterval(interval);
          setPollingJobId(null);
          queryClient.invalidateQueries({ queryKey: ['/api/audio-briefs', params.id] });
          toast({ title: '✅ تم توليد الصوت بنجاح' });
          setShowPreview(true);
        } else if (job.status === 'failed') {
          clearInterval(interval);
          setPollingJobId(null);
          toast({ title: '❌ فشل توليد الصوت', description: job.error });
        }
      } catch (error) {
        clearInterval(interval);
        setPollingJobId(null);
      }
    }, 3000);
    
    return () => clearInterval(interval);
  }, [pollingJobId]);
  
  const onSubmit = (data: any) => {
    saveMutation.mutate(data);
  };
  
  const handleGenerate = () => {
    if (!params.id) {
      const data = form.getValues();
      saveMutation.mutate(data, {
        onSuccess: (savedBrief) => {
          generateMutation.mutate(savedBrief.id);
        },
      });
    } else {
      generateMutation.mutate(params.id);
    }
  };
  
  const voiceSettings = form.watch('voiceSettings');
  
  return (
    <DashboardLayout>
      <div className="container mx-auto p-6 max-w-3xl" dir="rtl">
        <h1 className="text-3xl font-bold mb-6">
          {isEdit ? 'تعديل الخبر الصوتي' : 'إنشاء خبر صوتي جديد'}
        </h1>
        
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
          <div className="space-y-2">
            <Label htmlFor="title">العنوان</Label>
            <Input
              id="title"
              {...form.register('title')}
              placeholder="عنوان الخبر الصوتي"
              data-testid="input-title"
            />
            {form.formState.errors.title && (
              <p className="text-sm text-destructive">{form.formState.errors.title.message}</p>
            )}
          </div>
          
          <div className="space-y-2">
            <Label htmlFor="content">النص الإخباري</Label>
            <Textarea
              id="content"
              {...form.register('content')}
              placeholder="اكتب النص الإخباري هنا..."
              rows={8}
              data-testid="input-content"
            />
            {form.formState.errors.content && (
              <p className="text-sm text-destructive">{form.formState.errors.content.message}</p>
            )}
          </div>
          
          <div className="space-y-2">
            <Label>اختيار الصوت</Label>
            <Select
              value={form.watch('voiceId')}
              onValueChange={(value) => form.setValue('voiceId', value)}
            >
              <SelectTrigger data-testid="select-voice">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ARABIC_VOICES.map((voice) => (
                  <SelectItem key={voice.id} value={voice.id}>
                    {voice.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          
          <div className="space-y-4 p-4 border rounded-lg">
            <h3 className="font-semibold">إعدادات النبرة</h3>
            
            <div className="space-y-2">
              <Label>الاستقرار: {voiceSettings?.stability?.toFixed(2)}</Label>
              <Slider
                value={[voiceSettings?.stability || 0.5]}
                min={0}
                max={1}
                step={0.01}
                onValueChange={([value]) => 
                  form.setValue('voiceSettings.stability', value)
                }
                data-testid="slider-stability"
              />
            </div>
            
            <div className="space-y-2">
              <Label>التشابه: {voiceSettings?.similarity_boost?.toFixed(2)}</Label>
              <Slider
                value={[voiceSettings?.similarity_boost || 0.75]}
                min={0}
                max={1}
                step={0.01}
                onValueChange={([value]) =>
                  form.setValue('voiceSettings.similarity_boost', value)
                }
                data-testid="slider-similarity"
              />
            </div>
          </div>
          
          <div className="flex gap-2">
            <Button
              type="submit"
              disabled={saveMutation.isPending}
              data-testid="button-save"
            >
              {saveMutation.isPending && <Loader2 className="ml-2 h-4 w-4 animate-spin" />}
              حفظ
            </Button>
            
            <Button
              type="button"
              variant="secondary"
              onClick={handleGenerate}
              disabled={generateMutation.isPending || !!pollingJobId}
              data-testid="button-generate"
            >
              {(generateMutation.isPending || pollingJobId) && (
                <Loader2 className="ml-2 h-4 w-4 animate-spin" />
              )}
              توليد الصوت
            </Button>
            
            {brief?.audioUrl && (
              <Button
                type="button"
                variant="outline"
                onClick={() => setShowPreview(true)}
                data-testid="button-preview"
              >
                معاينة الصوت
              </Button>
            )}
          </div>
        </form>
        
        {brief?.audioUrl && (
          <Dialog open={showPreview} onOpenChange={setShowPreview}>
            <DialogContent className="max-w-2xl" dir="rtl">
              <DialogHeader>
                <DialogTitle>معاينة الخبر الصوتي</DialogTitle>
              </DialogHeader>
              <AudioPlayer
                newsletterId={brief.id}
                audioUrl={brief.audioUrl}
                title={brief.title}
                duration={brief.duration || undefined}
              />
            </DialogContent>
          </Dialog>
        )}
      </div>
    </DashboardLayout>
  );
}
