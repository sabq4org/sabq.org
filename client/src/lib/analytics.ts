declare global {
  interface Window {
    dataLayer: any[];
    gtag: (...args: any[]) => void;
  }
}

export const trackEvent = (
  action: string, 
  category?: string, 
  label?: string, 
  value?: number
) => {
  if (typeof window === 'undefined' || !window.gtag) return;
  
  window.gtag('event', action, {
    event_category: category,
    event_label: label,
    value: value,
  });
};

export const trackArticleView = (articleId: string, title: string, category?: string) => {
  trackEvent('article_view', 'engagement', `${articleId}: ${title}`);
};

export const trackScrollDepth = (depth: number, articleId?: string) => {
  trackEvent('scroll_depth', 'engagement', articleId, depth);
};

export const trackReadingTime = (seconds: number, articleId: string) => {
  trackEvent('reading_time', 'engagement', articleId, seconds);
};

export const trackShare = (platform: string, articleId: string) => {
  trackEvent('share', 'social', `${platform}: ${articleId}`);
};
