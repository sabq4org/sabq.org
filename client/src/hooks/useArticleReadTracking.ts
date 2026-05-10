import { useEffect, useRef } from "react";
import { useBehaviorTracking } from "./useBehaviorTracking";

interface UseArticleReadTrackingOptions {
  articleId: string;
  enabled?: boolean;
}

export function useArticleReadTracking({ 
  articleId, 
  enabled = true 
}: UseArticleReadTrackingOptions) {
  const { logBehavior } = useBehaviorTracking();
  const startTime = useRef<number>(Date.now());
  const hasLogged = useRef(false);
  const scrollDepth = useRef(0);

  useEffect(() => {
    if (!enabled || !articleId) return;

    const handleScroll = () => {
      const windowHeight = window.innerHeight;
      const documentHeight = document.documentElement.scrollHeight;
      const scrollTop = window.scrollY;
      const depth = Math.round(((scrollTop + windowHeight) / documentHeight) * 100);
      
      if (depth > scrollDepth.current) {
        scrollDepth.current = depth;
      }
    };

    const handleBeforeUnload = () => {
      if (!hasLogged.current) {
        const readTime = Math.round((Date.now() - startTime.current) / 1000);
        
        if (readTime >= 10) {
          hasLogged.current = true;
          logBehavior("article_read", {
            articleId,
            readTime,
            scrollDepth: scrollDepth.current,
          });
        }
      }
    };

    window.addEventListener("scroll", handleScroll);
    window.addEventListener("beforeunload", handleBeforeUnload);

    return () => {
      window.removeEventListener("scroll", handleScroll);
      window.removeEventListener("beforeunload", handleBeforeUnload);
      
      if (!hasLogged.current) {
        const readTime = Math.round((Date.now() - startTime.current) / 1000);
        
        if (readTime >= 10) {
          hasLogged.current = true;
          logBehavior("article_read", {
            articleId,
            readTime,
            scrollDepth: scrollDepth.current,
          });
        }
      }
    };
  }, [articleId, enabled, logBehavior]);

  const logArticleView = () => {
    if (enabled && articleId) {
      logBehavior("article_view", { articleId });
    }
  };

  return { logArticleView };
}
