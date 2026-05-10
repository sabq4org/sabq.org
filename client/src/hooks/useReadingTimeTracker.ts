import { useEffect, useRef, useCallback } from 'react';
import { trackBeacon } from '@/lib/queryClient';

interface UseReadingTimeTrackerOptions {
  articleId: string;
  minReadingTime?: number;
  isLoggedIn: boolean;
}

export function useReadingTimeTracker({ 
  articleId, 
  minReadingTime = 5,
  isLoggedIn 
}: UseReadingTimeTrackerOptions) {
  const startTimeRef = useRef<number | null>(null);
  const totalTimeRef = useRef<number>(0);
  const isActiveRef = useRef<boolean>(true);
  const hasSentRef = useRef<boolean>(false);

  const recordReadingTime = useCallback(async () => {
    if (!isLoggedIn || hasSentRef.current) return;
    
    const currentSessionTime = isActiveRef.current && startTimeRef.current 
      ? Math.floor((Date.now() - startTimeRef.current) / 1000)
      : 0;
    
    const totalSeconds = totalTimeRef.current + currentSessionTime;
    
    if (totalSeconds >= minReadingTime) {
      hasSentRef.current = true;
      // Use sendBeacon (with keepalive-fetch fallback) so the value survives
      // beforeunload — fetch requests are routinely cancelled when the page
      // is closing. Always silent.
      try {
        const ok = trackBeacon(
          `/api/articles/${articleId}/reading-time`,
          { duration: totalSeconds },
        );
        if (!ok) hasSentRef.current = false;
      } catch (error) {
        console.debug('Failed to record reading time (silent):', error);
        hasSentRef.current = false;
      }
    }
  }, [articleId, isLoggedIn, minReadingTime]);

  useEffect(() => {
    if (!isLoggedIn) return;

    startTimeRef.current = Date.now();
    isActiveRef.current = true;
    hasSentRef.current = false;
    totalTimeRef.current = 0;

    const handleVisibilityChange = () => {
      if (document.hidden) {
        if (startTimeRef.current && isActiveRef.current) {
          totalTimeRef.current += Math.floor((Date.now() - startTimeRef.current) / 1000);
        }
        isActiveRef.current = false;
        startTimeRef.current = null;
      } else {
        startTimeRef.current = Date.now();
        isActiveRef.current = true;
      }
    };

    const handleBeforeUnload = () => {
      recordReadingTime();
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('beforeunload', handleBeforeUnload);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('beforeunload', handleBeforeUnload);
      recordReadingTime();
    };
  }, [articleId, isLoggedIn, recordReadingTime]);

  return { recordReadingTime };
}
