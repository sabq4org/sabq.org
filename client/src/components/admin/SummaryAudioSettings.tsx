import { useEffect, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Volume2, Loader2 } from 'lucide-react';
import { apiRequest } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';

type Settings = { primaryProvider: 'humain' | 'elevenlabs'; humainVoiceId: string; elevenlabsVoiceId: string };
type Voice = { id: string; name: string; description?: string };
type SettingsResponse = {
  settings: Settings;
  humainVoices: Voice[];
  elevenlabsVoices: Voice[];
  configured: { humain: boolean; elevenlabs: boolean };
};
const endpoint = '/api/system/summary-audio-settings';

export function SummaryAudioSettings() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const query = useQuery<SettingsResponse>({ queryKey: [endpoint], queryFn: () => apiRequest<SettingsResponse>(endpoint, { silent: true }) });
  const [draft, setDraft] = useState<Settings | null>(null);
  const [preview, setPreview] = useState<{ url: string; label: string } | null>(null);
  const active = useRef(true);
  const settings = draft ?? query.data?.settings;
  useEffect(() => { active.current = true; return () => { active.current = false; }; }, []);
  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview.url); }, [preview]);

  const save = useMutation({
    mutationFn: async (value: Settings) => {
      return apiRequest<SettingsResponse>(endpoint, { method: 'PUT', body: JSON.stringify(value) });
    },
    onSuccess: data => {
      queryClient.setQueryData([endpoint], data);
      setDraft(null);
      toast({ title: 'تم حفظ صوت الموجز', description: 'يُطبّق الاختيار عند تحميل الموجز الصوتي من جديد.' });
    },
    onError: () => toast({ title: 'تعذّر حفظ إعدادات الصوت', description: 'لم تُحفظ التغييرات. حاول مرة أخرى.', variant: 'destructive' }),
  });
  const test = useMutation({
    mutationFn: async (provider: 'humain' | 'elevenlabs') => {
      if (!settings || !query.data) throw new Error('الإعدادات غير متوفرة');
      const voiceId = provider === 'humain' ? settings.humainVoiceId : settings.elevenlabsVoiceId;
      const voice = (provider === 'humain' ? query.data.humainVoices : query.data.elevenlabsVoices).find(v => v.id === voiceId);
      setPreview(null);
      const response = await apiRequest<Response>(`${endpoint}/preview`, { method: 'POST', body: JSON.stringify({ provider, voiceId }) });
      const blob = await response.blob();
      if (!blob.size || !blob.type.startsWith('audio/')) throw new Error('معاينة غير صالحة');
      return { blob, label: `${provider === 'humain' ? 'HUMAIN' : 'ElevenLabs'} — ${voice?.name ?? ''}` };
    },
    onSuccess: ({ blob, label }) => { if (active.current) setPreview({ url: URL.createObjectURL(blob), label }); },
    onError: () => toast({ title: 'تعذّرت معاينة الصوت المحدد', description: 'تحقّق من جاهزية المزود ورصيده، ثم أعد المحاولة.', variant: 'destructive' }),
  });
  const disabled = save.isPending || test.isPending;
  const change = (patch: Partial<Settings>) => { if (settings) setDraft({ ...settings, ...patch }); setPreview(null); };

  return <Card data-testid="summary-audio-settings" dir="rtl">
    <CardHeader>
      <CardTitle className="flex items-center gap-2"><Volume2 className="h-5 w-5" />صوت موجز الأخبار</CardTitle>
      <CardDescription>اختر صوت قراءة موجز المقالات والأخبار. تستطيع الاستماع إلى عينة قبل حفظ الاختيار.</CardDescription>
    </CardHeader>
    <CardContent className="space-y-5">
      {query.isLoading && <p role="status">جارٍ تحميل إعدادات الصوت…</p>}
      {query.isError && <div role="alert" className="space-y-2"><p>تعذّر تحميل إعدادات الصوت.</p><Button variant="outline" onClick={() => query.refetch()}>إعادة المحاولة</Button></div>}
      {settings && query.data && <>
        <div className="space-y-2 max-w-md">
          <Label htmlFor="summary-audio-provider">المزود الأساسي</Label>
          <Select value={settings.primaryProvider} onValueChange={value => change({ primaryProvider: value as Settings['primaryProvider'] })} disabled={disabled} dir="rtl">
            <SelectTrigger id="summary-audio-provider"><SelectValue /></SelectTrigger>
            <SelectContent><SelectItem value="humain">HUMAIN — أصوات سعودية</SelectItem><SelectItem value="elevenlabs">ElevenLabs</SelectItem></SelectContent>
          </Select>
        </div>
        <div className="grid gap-5 md:grid-cols-2">
          {(['humain', 'elevenlabs'] as const).map(provider => {
            const isHumain = provider === 'humain';
            const title = isHumain ? 'صوت HUMAIN' : settings.primaryProvider === 'humain' ? 'صوت ElevenLabs الاحتياطي' : 'صوت ElevenLabs';
            const voices = isHumain ? query.data!.humainVoices : query.data!.elevenlabsVoices;
            const ready = query.data!.configured[provider];
            return <div key={provider} className="space-y-3 rounded-xl border p-4">
              <div className="flex flex-wrap items-center justify-between gap-2"><Label htmlFor={`summary-voice-${provider}`}>{title}</Label><Badge variant={ready ? 'secondary' : 'outline'}>{ready ? 'المفتاح مضاف' : 'المفتاح غير مضاف'}</Badge></div>
              <Select value={isHumain ? settings.humainVoiceId : settings.elevenlabsVoiceId} onValueChange={value => change(isHumain ? { humainVoiceId: value } : { elevenlabsVoiceId: value })} disabled={disabled} dir="rtl">
                <SelectTrigger id={`summary-voice-${provider}`}><SelectValue /></SelectTrigger>
                <SelectContent>{voices.map(v => <SelectItem value={v.id} key={v.id}>{v.name}{v.description ? ` — ${v.description}` : ''}</SelectItem>)}</SelectContent>
              </Select>
              {!ready && <p className="text-sm text-muted-foreground">يلزم إضافة مفتاح {isHumain ? 'HUMAIN' : 'ElevenLabs'} في إعدادات الخادم لتشغيل هذا المزود.</p>}
              <Button type="button" variant="outline" disabled={!ready || disabled} onClick={() => test.mutate(provider)}>{test.isPending && test.variables === provider ? <Loader2 className="h-4 w-4 animate-spin ml-2" /> : <Volume2 className="h-4 w-4 ml-2" />}استمع إلى عينة {isHumain ? 'HUMAIN' : 'ElevenLabs'}</Button>
            </div>;
          })}
        </div>
        <p className="text-sm text-muted-foreground">عند تعذّر HUMAIN ينتقل الموجز تلقائيًا إلى صوت ElevenLabs المحدد. وإذا تعذّر الاثنان يُستخدم Google كخيار أخير.</p>
        {test.isPending && <p role="status" className="text-sm">جارٍ توليد العينة بالصوت المحدد…</p>}
        {preview && <div className="space-y-2"><p className="text-sm font-medium">معاينة: {preview.label}</p><audio controls src={preview.url} aria-label={`معاينة ${preview.label}`} className="w-full max-w-lg" /></div>}
        <Button type="button" onClick={() => save.mutate(settings)} disabled={disabled || (draft !== null && JSON.stringify(draft) === JSON.stringify(query.data.settings))}>{save.isPending && <Loader2 className="h-4 w-4 animate-spin ml-2" />}حفظ إعدادات الصوت</Button>
      </>}
    </CardContent>
  </Card>;
}
