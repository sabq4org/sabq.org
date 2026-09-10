import { useCallback, useEffect, useRef, useState } from 'react';
import { apiUrl } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';

/** Attribution comes from the same response as the played bytes, including fallback. */
export function useArticleSummaryAudio(slug: string | undefined, revision: string, hasSummary: boolean) {
  const { toast } = useToast();
  const [isLoadingAudio, setIsLoadingAudio] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [provider, setProvider] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const requestRef = useRef<AbortController | null>(null);
  const objectUrlRef = useRef<string | null>(null);
  const dispose = useCallback(() => {
    requestRef.current?.abort(); requestRef.current = null;
    if (audioRef.current) {
      audioRef.current.onended = null; audioRef.current.onerror = null;
      audioRef.current.pause(); audioRef.current.removeAttribute('src'); audioRef.current.load();
      audioRef.current = null;
    }
    if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current);
    objectUrlRef.current = null;
  }, []);
  useEffect(() => {
    setProvider(null); setIsPlaying(false); setIsLoadingAudio(false);
    return dispose;
  }, [slug, revision, dispose]);

  const handlePlayAudio = useCallback(async () => {
    if (!hasSummary || !slug) {
      toast({ title: 'لا يوجد محتوى', description: 'الموجز الذكي غير متوفر لهذا المقال', variant: 'destructive' });
      return;
    }
    if (requestRef.current) return;
    if (audioRef.current && !audioRef.current.paused) {
      audioRef.current.pause(); audioRef.current.currentTime = 0; setIsPlaying(false);
      return;
    }
    const controller = new AbortController();
    requestRef.current = controller;
    setIsLoadingAudio(true);
    try {
      let audio = audioRef.current;
      let actualProvider = provider;
      if (!audio) {
        setProvider(null);
        const url = `/api/articles/${encodeURIComponent(slug)}/summary-audio?v=${encodeURIComponent(revision)}&tts=humain-v4`;
        const response = await fetch(apiUrl(url), { credentials: 'include', signal: controller.signal, cache: 'no-store' });
        if (!response.ok) throw new Error('Audio request failed');
        const blob = await response.blob();
        if (controller.signal.aborted) return;
        if (!blob.size || !blob.type.startsWith('audio/')) throw new Error('Invalid audio response');
        actualProvider = response.headers.get('X-TTS-Provider')?.trim().toLowerCase() ?? null;
        objectUrlRef.current = URL.createObjectURL(blob);
        audio = new Audio(objectUrlRef.current);
        audioRef.current = audio;
        audio.onended = () => setIsPlaying(false);
        audio.onerror = () => {
          dispose(); setProvider(null); setIsPlaying(false); setIsLoadingAudio(false);
          toast({ title: 'خطأ', description: 'فشل تشغيل الموجز الصوتي', variant: 'destructive' });
        };
      }
      await audio.play();
      if (controller.signal.aborted) return;
      setProvider(actualProvider); setIsPlaying(true);
    } catch {
      if (controller.signal.aborted) return;
      dispose(); setProvider(null); setIsPlaying(false); setIsLoadingAudio(false);
      toast({ title: 'خطأ', description: 'فشل تشغيل الموجز الصوتي', variant: 'destructive' });
    } finally {
      if (!controller.signal.aborted) { requestRef.current = null; setIsLoadingAudio(false); }
    }
  }, [hasSummary, slug, revision, provider, toast, dispose]);
  return { isLoadingAudio, isPlaying, provider, handlePlayAudio };
}
