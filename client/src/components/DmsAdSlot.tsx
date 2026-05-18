import { useEffect, useState, useRef, useCallback } from 'react';

interface DmsAdSlotProps {
  id: string;
  type: 'leaderboard' | 'mpu';
  className?: string;
  lazyLoad?: boolean;
}

export function DmsAdSlot({ id, type, className = '', lazyLoad = false }: DmsAdSlotProps) {
  const [adState, setAdState] = useState<'loading' | 'filled' | 'empty'>('loading');
  const [shouldTriggerAds, setShouldTriggerAds] = useState(!lazyLoad);
  const containerRef = useRef<HTMLDivElement>(null);
  const hasTriggeredRef = useRef(false);
  const slotIdRef = useRef(id);

  useEffect(() => {
    if (!lazyLoad) return;
    
    const container = containerRef.current;
    if (!container) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) {
          setShouldTriggerAds(true);
          observer.disconnect();
        }
      },
      { rootMargin: '200px', threshold: 0 }
    );

    observer.observe(container);
    return () => observer.disconnect();
  }, [lazyLoad]);

  useEffect(() => {
    if (!shouldTriggerAds || hasTriggeredRef.current) return;
    hasTriggeredRef.current = true;
    
    requestAnimationFrame(() => {
      triggerAds();
    });
  }, [shouldTriggerAds]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    
    const slotId = slotIdRef.current;
    
    const handleSlotRenderEnded = (event: any) => {
      const slot = event.slot;
      if (!slot) return;
      
      const slotElementId = slot.getSlotElementId();
      if (slotElementId !== slotId) return;
      
      if (event.isEmpty) {
        setAdState('empty');
      } else {
        setAdState('filled');
      }
    };
    
    const setupListener = () => {
      if (window.googletag && window.googletag.pubads) {
        try {
          window.googletag.cmd = window.googletag.cmd || [];
          window.googletag.cmd.push(() => {
            window.googletag.pubads().addEventListener('slotRenderEnded', handleSlotRenderEnded);
          });
        } catch (e) {
          console.warn('[DmsAdSlot] Failed to add GPT listener:', e);
        }
      }
    };
    
    if (window.googletag) {
      setupListener();
    } else {
      const checkInterval = setInterval(() => {
        if (window.googletag) {
          setupListener();
          clearInterval(checkInterval);
        }
      }, 500);
      const cleanup = setTimeout(() => {
        clearInterval(checkInterval);
      }, 8000);
      return () => {
        clearInterval(checkInterval);
        clearTimeout(cleanup);
      };
    }

    const fallbackTimeout = setTimeout(() => {
      if (adState === 'loading') {
        const container = containerRef.current;
        let hasContent = false;
        if (container) {
          const iframes = container.querySelectorAll('iframe');
          iframes.forEach(iframe => {
            const w = iframe.offsetWidth || parseInt(iframe.getAttribute('width') || '0');
            const h = iframe.offsetHeight || parseInt(iframe.getAttribute('height') || '0');
            if (w >= 50 && h >= 50) hasContent = true;
          });
        }
        setAdState(hasContent ? 'filled' : 'empty');
      }
    }, 5000);

    return () => {
      clearTimeout(fallbackTimeout);
    };
  }, [adState]);

  // Inner style: just the slot's own size/centering. Spacing is on the
  // wrapper so we don't lose it when the slot is wrapped.
  const innerStyle: React.CSSProperties = adState === 'empty'
    ? { minHeight: 0, height: 0, overflow: 'hidden', margin: 0, padding: 0, border: 'none' }
    : type === 'leaderboard'
    ? { minHeight: '90px', width: '100%', textAlign: 'center', overflow: 'hidden' }
    : { minHeight: '250px', width: '100%', textAlign: 'center', overflow: 'hidden' };

  // Ad creatives are served by DMS as cross-origin iframes whose body
  // background we can't restyle, so we frame the slot in a `bg-card`
  // rounded container so the light creative reads as an intentional
  // card in dark mode. CRITICAL: the wrapper/inner tree shape MUST be
  // constant across renders — an earlier version branched the JSX on
  // adState (wrapped tree when loading/filled, bare tree when empty)
  // and the structural flip raced GPT's iframe injection, surfacing as
  // a NotFoundError ("The object can not be found here.") thrown by
  // React's commit phase on first load. We instead always render the
  // wrapper + inner pair, and only toggle classes/styles when the slot
  // resolves to 'empty' so unsold slots reserve no visual space.
  const wrapperSpacing = type === 'leaderboard' ? 'mb-8' : 'mt-8';
  const wrapperClass = adState === 'empty'
    ? (className ?? '').trim()
    : `rounded-xl bg-card p-2 ${wrapperSpacing} ${className ?? ''}`.trim();

  return (
    <div
      className={wrapperClass}
      data-testid={`dms-ad-slot-wrapper-${id}`}
      data-ad-state={adState}
    >
      <div
        ref={containerRef}
        id={id}
        style={innerStyle}
        data-testid={`dms-ad-slot-${id}`}
        data-ad-state={adState}
      />
    </div>
  );
}

export function DmsLeaderboardAd({ className }: { className?: string }) {
  return <DmsAdSlot id="Leaderboard" type="leaderboard" className={`hidden md:block ${className}`} />;
}

export function DmsMpuAd({ id = 'MPU', className, lazyLoad = false }: { id?: string; className?: string; lazyLoad?: boolean }) {
  return <DmsAdSlot id={id} type="mpu" className={`md:hidden ${className}`} lazyLoad={lazyLoad} />;
}

export function LiteModeAdSlot({ index }: { index: number }) {
  const [adState, setAdState] = useState<'loading' | 'filled' | 'empty'>('loading');
  const containerRef = useRef<HTMLDivElement>(null);
  const slotId = 'MPU';

  useEffect(() => {
    if (typeof window === 'undefined') return;
    
    const handleSlotRenderEnded = (event: any) => {
      const slot = event.slot;
      if (!slot) return;
      
      const slotElementId = slot.getSlotElementId();
      if (slotElementId !== slotId) return;
      
      if (event.isEmpty) {
        setAdState('empty');
      } else {
        setAdState('filled');
      }
    };
    
    const setupListener = () => {
      if (window.googletag && window.googletag.pubads) {
        try {
          window.googletag.cmd = window.googletag.cmd || [];
          window.googletag.cmd.push(() => {
            window.googletag.pubads().addEventListener('slotRenderEnded', handleSlotRenderEnded);
          });
        } catch (e) {
          console.warn('[LiteModeAdSlot] Failed to add GPT listener:', e);
        }
      }
    };
    
    if (window.googletag) {
      setupListener();
    }
    
    const fallbackTimeout = setTimeout(() => {
      if (adState === 'loading') {
        const container = containerRef.current;
        let hasContent = false;
        if (container) {
          const iframes = container.querySelectorAll('iframe');
          iframes.forEach(iframe => {
            const w = iframe.offsetWidth || parseInt(iframe.getAttribute('width') || '0');
            const h = iframe.offsetHeight || parseInt(iframe.getAttribute('height') || '0');
            if (w >= 50 && h >= 50) hasContent = true;
          });
        }
        setAdState(hasContent ? 'filled' : 'empty');
      }
    }, 5000);

    return () => clearTimeout(fallbackTimeout);
  }, [adState]);

  const mpuFilledStyle: React.CSSProperties = { minHeight: '250px', marginTop: '2rem', width: '100%', textAlign: 'center', overflow: 'hidden' };

  const style: React.CSSProperties = adState === 'filled'
    ? mpuFilledStyle
    : adState === 'empty'
    ? { minHeight: 0, height: 0, overflow: 'hidden', margin: 0, padding: 0, border: 'none' }
    : mpuFilledStyle;

  return (
    <div
      ref={containerRef}
      id="MPU"
      data-slot-index={index}
      style={style}
      data-testid={`dms-ad-slot-lite-mpu-${index}`}
      data-ad-state={adState}
    />
  );
}

export function LiteModeArticleAd() {
  const [adState, setAdState] = useState<'loading' | 'filled' | 'empty'>('loading');
  const containerRef = useRef<HTMLDivElement>(null);
  const slotId = 'MPU';

  useEffect(() => {
    if (typeof window === 'undefined') return;
    
    const handleSlotRenderEnded = (event: any) => {
      const slot = event.slot;
      if (!slot) return;
      
      const slotElementId = slot.getSlotElementId();
      if (slotElementId !== slotId) return;
      
      if (event.isEmpty) {
        setAdState('empty');
      } else {
        setAdState('filled');
      }
    };
    
    const setupListener = () => {
      if (window.googletag && window.googletag.pubads) {
        try {
          window.googletag.cmd = window.googletag.cmd || [];
          window.googletag.cmd.push(() => {
            window.googletag.pubads().addEventListener('slotRenderEnded', handleSlotRenderEnded);
          });
        } catch (e) {
          console.warn('[LiteModeArticleAd] Failed to add GPT listener:', e);
        }
      }
    };
    
    if (window.googletag) {
      setupListener();
    }
    
    const fallbackTimeout = setTimeout(() => {
      if (adState === 'loading') {
        const container = containerRef.current;
        let hasContent = false;
        if (container) {
          const iframes = container.querySelectorAll('iframe');
          iframes.forEach(iframe => {
            const w = iframe.offsetWidth || parseInt(iframe.getAttribute('width') || '0');
            const h = iframe.offsetHeight || parseInt(iframe.getAttribute('height') || '0');
            if (w >= 50 && h >= 50) hasContent = true;
          });
        }
        setAdState(hasContent ? 'filled' : 'empty');
      }
    }, 5000);

    return () => clearTimeout(fallbackTimeout);
  }, [adState]);

  const articleMpuStyle: React.CSSProperties = { minHeight: '250px', marginTop: '2rem', width: '100%', textAlign: 'center', overflow: 'hidden' };

  const style: React.CSSProperties = adState === 'filled'
    ? articleMpuStyle
    : adState === 'empty'
    ? { minHeight: 0, height: 0, overflow: 'hidden', margin: 0, padding: 0, border: 'none' }
    : articleMpuStyle;

  return (
    <div 
      ref={containerRef}
      id="MPU"
      style={style}
      data-testid="dms-ad-slot-lite-article"
      data-ad-state={adState}
    />
  );
}

declare global {
  interface Window {
    dataLayer: any[];
    signal: {
      User: {
        UserId: string | null;
        Country: string | null;
        EmailHash: string | null;
      };
      Content: {
        Topic: string | null;
        sTopic: string | null;
        Keywords: string | null;
        ArticleId: string | null;
        ArticleTitle: string | null;
        ArticleAuthorName: string | null;
        ArticlePublishDate: string | null;
        SearchTerm: string | null;
        Platform: string;
        Lang: string | null;
      };
      Page: {
        ChannelLevel1: string | null;
        ChannelLevel2: string | null;
      };
    };
    googletag: any;
    _dmsAdTriggerDebounce?: number;
    _dmsLastTriggerTime?: number;
  }
}

let hasTriggeredAdsForCurrentPage = false;
let currentPageUrl = '';

export function resetAdsTriggerFlag() {
  hasTriggeredAdsForCurrentPage = false;
  currentPageUrl = '';
}

export function triggerAds() {
  if (typeof window === 'undefined') return;
  
  const now = window.location.href;
  if (hasTriggeredAdsForCurrentPage && currentPageUrl === now) {
    return;
  }
  
  hasTriggeredAdsForCurrentPage = true;
  currentPageUrl = now;
  
  if (window.dataLayer && Array.isArray(window.dataLayer)) {
    window.dataLayer.push({
      event: 'triggerAds'
    });
  }
}

export function forceTriggerAds() {
  if (typeof window === 'undefined') return;
  if (window.dataLayer && Array.isArray(window.dataLayer)) {
    window.dataLayer.push({
      event: 'triggerAds'
    });
  }
}

export function forceTriggerAdsWhenReady() {
  if (typeof window === 'undefined') return;
  
  let attempts = 0;
  const maxAttempts = 20;
  
  const checkAndTrigger = () => {
    attempts++;
    const leaderboard = document.getElementById('Leaderboard');
    const mpu = document.getElementById('MPU');
    
    if (leaderboard || mpu) {
      requestAnimationFrame(() => forceTriggerAds());
    } else if (attempts < maxAttempts) {
      setTimeout(checkAndTrigger, 150);
    }
  };
  
  if (document.readyState === 'complete') {
    requestAnimationFrame(checkAndTrigger);
  } else {
    window.addEventListener('load', () => requestAnimationFrame(checkAndTrigger), { once: true });
  }
}

export function triggerAdsWhenReady() {
  if (typeof window === 'undefined') return;
  
  let attempts = 0;
  const maxAttempts = 20;
  
  const checkAndTrigger = () => {
    attempts++;
    const leaderboard = document.getElementById('Leaderboard');
    const mpu = document.getElementById('MPU');
    
    if (leaderboard || mpu) {
      requestAnimationFrame(() => triggerAds());
    } else if (attempts < maxAttempts) {
      setTimeout(checkAndTrigger, 150);
    }
  };
  
  if (document.readyState === 'complete') {
    requestAnimationFrame(checkAndTrigger);
  } else {
    window.addEventListener('load', () => requestAnimationFrame(checkAndTrigger), { once: true });
  }
}

interface SignalParams {
  channelLevel1: string;
  channelLevel2?: string;
  articleId?: string;
  articleTitle?: string;
  author?: string;
  publishDate?: string;
  keywords?: string;
  contentType?: string;
  userId?: string;
  country?: string;
  emailHash?: string;
  searchTerm?: string;
  lang?: string;
}

export function updateSignalDataLayer(params: SignalParams | string, articleId: string = '') {
  if (typeof window === 'undefined' || !window.signal) return;
  
  if (typeof params === 'string') {
    const englishChannel = getCategoryChannelLevel(params);
    window.signal.Page.ChannelLevel1 = englishChannel;
    window.signal.Page.ChannelLevel2 = null;
    window.signal.Content.ArticleId = articleId || null;
    window.signal.Content.ArticleTitle = null;
    window.signal.Content.ArticleAuthorName = null;
    window.signal.Content.ArticlePublishDate = null;
    window.signal.Content.Keywords = null;
    window.signal.Content.Topic = englishChannel;
    window.signal.Content.sTopic = null;
    return;
  }
  
  const englishChannel = getCategoryChannelLevel(params.channelLevel1);
  const subChannel = params.channelLevel2 ? getCategoryChannelLevel(params.channelLevel2) : null;
  
  window.signal.Page.ChannelLevel1 = englishChannel;
  window.signal.Page.ChannelLevel2 = subChannel;
  
  window.signal.Content.Topic = englishChannel;
  window.signal.Content.sTopic = subChannel;
  window.signal.Content.ArticleId = params.articleId || null;
  window.signal.Content.ArticleTitle = params.articleTitle || null;
  window.signal.Content.ArticleAuthorName = params.author || null;
  window.signal.Content.ArticlePublishDate = params.publishDate || null;
  window.signal.Content.Keywords = params.keywords || null;
  window.signal.Content.SearchTerm = params.searchTerm || null;
  window.signal.Content.Lang = params.lang || 'ar';
  
  window.signal.User.UserId = params.userId || null;
  window.signal.User.Country = params.country || null;
  window.signal.User.EmailHash = params.emailHash || null;
}

const categoryMapping: Record<string, string> = {
  'الرئيسية': 'Homepage',
  'محلي': 'Local',
  'رياضة': 'Sports',
  'سياسة': 'Politics',
  'اقتصاد': 'Business',
  'تقنية': 'Technology',
  'ثقافة': 'Culture',
  'صحة': 'Health',
  'ترفيه': 'Entertainment',
  'علوم': 'Science',
  'عالمي': 'World',
  'أخبار': 'News',
  'فن': 'Art',
  'سيارات': 'Automotive',
  'سفر': 'Travel',
  'طقس': 'Weather',
  'رأي': 'Opinion',
  'تعليم': 'Education',
  'عقارات': 'RealEstate',
  'طبخ': 'Cooking',
  'موضة': 'Fashion',
  'جمال': 'Beauty',
  'أعمال': 'Business',
  'تاريخ': 'History',
  'دين': 'Religion',
  'بيئة': 'Environment',
  'Arabic': 'Homepage',
  'Homepage': 'Homepage',
  'لحظة بلحظة': 'MomentByMoment',
  'مُقترب': 'Muqtarab',
  'السعودية': 'Saudi',
  'مناطق': 'Regions',
  'مجتمع': 'Community',
  'سياحة': 'Tourism',
  'حياة': 'Life',
  'حياتنا': 'Life',
  'محطات': 'Stations',
  'عالم': 'World',
  'العالم': 'World',
  'محليات': 'Saudi',
  'Sponsored_Page': 'Sponsored_Page'
};

export function getCategoryChannelLevel(categoryName: string): string {
  if (!categoryName) return 'Homepage';
  const mapped = categoryMapping[categoryName];
  if (mapped) return mapped;
  if (/^[a-zA-Z_]+$/.test(categoryName)) {
    return categoryName;
  }
  return 'Homepage';
}

export function useAdTracking(channelLevel1: string, articleId?: string) {
  const lastTriggeredKeyRef = useRef<string | null>(null);
  
  useEffect(() => {
    if (!channelLevel1) return;
    
    const englishChannel = getCategoryChannelLevel(channelLevel1);
    const pageKey = `${englishChannel}:${articleId || ''}`;
    
    if (lastTriggeredKeyRef.current === pageKey) {
      return;
    }
    
    lastTriggeredKeyRef.current = pageKey;
    
    updateSignalDataLayer(channelLevel1, articleId || '');
    triggerAdsWhenReady();
  }, [channelLevel1, articleId]);
}

export function useLiteModeAdTracking() {
  useEffect(() => {
    updateSignalDataLayer({
      channelLevel1: 'LiteMode',
      channelLevel2: 'Feed',
      contentType: 'feed'
    });
    triggerAdsWhenReady();
  }, []);
}

export function useLiteModeArticleAdTracking(articleId: string, articleTitle: string, categoryName?: string) {
  useEffect(() => {
    if (!articleId) return;
    
    updateSignalDataLayer({
      channelLevel1: 'LiteMode',
      channelLevel2: getCategoryChannelLevel(categoryName || ''),
      articleId: articleId,
      articleTitle: articleTitle,
      contentType: 'article'
    });
    triggerAdsWhenReady();
  }, [articleId, articleTitle, categoryName]);
}
