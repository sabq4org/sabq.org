import { useLocation } from "wouter";
import { useResolvedLanguage } from "@/hooks/useResolvedLanguage";
import { useCallback } from "react";

export function SkipLinks() {
  const [location] = useLocation();
  const currentLang = useResolvedLanguage();

  // Track skip link events
  const trackEvent = useCallback(async (
    eventType: string,
    eventAction: string,
    eventValue?: string
  ) => {
    if (typeof window === 'undefined') return;
    
    try {
      await fetch('/api/accessibility/track', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          eventType,
          eventAction,
          eventValue,
          language: currentLang,
          pageUrl: location,
        }),
      });
    } catch (error) {
      console.debug('Accessibility tracking failed:', error);
    }
  }, [currentLang, location]);

  const handleSkipLink = (e: React.MouseEvent<HTMLAnchorElement>, targetId: string) => {
    e.preventDefault();
    
    // Track skip link click
    trackEvent('skipLink', 'clicked', targetId);
    
    const target = document.getElementById(targetId);
    if (target) {
      target.focus();
      target.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };

  return (
    <div className="sr-only focus-within:not-sr-only">
      <a
        href="#main-content"
        onClick={(e) => handleSkipLink(e, 'main-content')}
        className="fixed top-4 right-4 z-[100] bg-primary text-primary-foreground px-4 py-2 rounded-md font-medium shadow-lg focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 transition-all"
        data-testid="skip-link-main"
      >
        انتقل إلى المحتوى الرئيسي
      </a>
      <a
        href="#main-nav"
        onClick={(e) => handleSkipLink(e, 'main-nav')}
        className="fixed top-16 right-4 z-[100] bg-primary text-primary-foreground px-4 py-2 rounded-md font-medium shadow-lg focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 transition-all"
        data-testid="skip-link-nav"
      >
        انتقل إلى القائمة
      </a>
      <a
        href="#footer"
        onClick={(e) => handleSkipLink(e, 'footer')}
        className="fixed top-28 right-4 z-[100] bg-primary text-primary-foreground px-4 py-2 rounded-md font-medium shadow-lg focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 transition-all"
        data-testid="skip-link-footer"
      >
        انتقل إلى التذييل
      </a>
    </div>
  );
}
